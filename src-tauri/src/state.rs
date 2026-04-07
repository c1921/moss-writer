use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        mpsc::{self, Sender},
        Arc, Mutex,
    },
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};

use tauri::{AppHandle, Emitter};

use crate::commands::{
    list_project_files, ProjectFilesChangedEvent, ProjectFilesChangedKind,
    PROJECT_FILES_CHANGED_EVENT,
};

const WATCH_INTERVAL: Duration = Duration::from_millis(700);
const SUPPRESSION_TTL: Duration = Duration::from_secs(2);

type ProjectSnapshot = BTreeMap<String, Option<u64>>;

struct ProjectWatcher {
    stop_tx: Sender<()>,
    handle: Option<JoinHandle<()>>,
}

impl ProjectWatcher {
    fn stop(mut self) {
        let _ = self.stop_tx.send(());
        if let Some(handle) = self.handle.take() {
            let _ = handle.join();
        }
    }
}

struct SuppressedPath {
    path: String,
    expires_at: Instant,
}

#[derive(Default)]
struct SelfWriteSuppression {
    entries: Mutex<Vec<SuppressedPath>>,
}

impl SelfWriteSuppression {
    fn suppress_paths<I>(&self, paths: I)
    where
        I: IntoIterator<Item = String>,
    {
        let Ok(mut entries) = self.entries.lock() else {
            return;
        };

        let now = Instant::now();
        entries.retain(|entry| entry.expires_at > now);

        for path in paths {
            let trimmed = path.trim();
            if trimmed.is_empty() {
                continue;
            }

            entries.push(SuppressedPath {
                path: trimmed.to_string(),
                expires_at: now + SUPPRESSION_TTL,
            });
        }
    }

    fn consume_path(&self, path: &str) -> bool {
        let Ok(mut entries) = self.entries.lock() else {
            return false;
        };

        let now = Instant::now();
        entries.retain(|entry| entry.expires_at > now);

        if let Some(index) = entries.iter().position(|entry| entry.path == path) {
            entries.remove(index);
            return true;
        }

        false
    }
}

pub struct ProjectState {
    root: Mutex<Option<PathBuf>>,
    watcher: Mutex<Option<ProjectWatcher>>,
    watcher_revision: Arc<AtomicU64>,
    suppression: Arc<SelfWriteSuppression>,
}

impl Default for ProjectState {
    fn default() -> Self {
        Self {
            root: Mutex::new(None),
            watcher: Mutex::new(None),
            watcher_revision: Arc::new(AtomicU64::new(0)),
            suppression: Arc::new(SelfWriteSuppression::default()),
        }
    }
}

impl ProjectState {
    pub fn set_root(&self, path: PathBuf, app_handle: AppHandle) -> Result<(), String> {
        {
            let mut guard = self
                .root
                .lock()
                .map_err(|_| "项目状态不可用，请重试".to_string())?;

            *guard = Some(path.clone());
        }

        let revision = self.watcher_revision.fetch_add(1, Ordering::SeqCst) + 1;
        let next_watcher = spawn_project_watcher(
            path,
            app_handle,
            revision,
            Arc::clone(&self.watcher_revision),
            Arc::clone(&self.suppression),
        );

        let previous_watcher = {
            let mut guard = self
                .watcher
                .lock()
                .map_err(|_| "项目状态不可用，请重试".to_string())?;

            guard.replace(next_watcher)
        };

        if let Some(watcher) = previous_watcher {
            watcher.stop();
        }

        Ok(())
    }

    pub fn get_root(&self) -> Result<PathBuf, String> {
        self.root
            .lock()
            .map_err(|_| "项目状态不可用，请重试".to_string())?
            .clone()
            .ok_or_else(|| "请先打开一个小说项目".to_string())
    }

    pub fn suppress_paths<I>(&self, paths: I)
    where
        I: IntoIterator<Item = String>,
    {
        self.suppression.suppress_paths(paths);
    }
}

fn spawn_project_watcher(
    root: PathBuf,
    app_handle: AppHandle,
    revision: u64,
    watcher_revision: Arc<AtomicU64>,
    suppression: Arc<SelfWriteSuppression>,
) -> ProjectWatcher {
    let (stop_tx, stop_rx) = mpsc::channel();
    let handle = thread::spawn(move || {
        let project_path = root.to_string_lossy().to_string();
        let mut previous_snapshot = snapshot_project_files(&root).unwrap_or_default();

        loop {
            if stop_rx.recv_timeout(WATCH_INTERVAL).is_ok() {
                break;
            }

            if watcher_revision.load(Ordering::SeqCst) != revision {
                break;
            }

            let Ok(current_snapshot) = snapshot_project_files(&root) else {
                continue;
            };

            let changes = diff_snapshots(&previous_snapshot, &current_snapshot);
            previous_snapshot = current_snapshot;

            for (kind, paths) in changes {
                let visible_paths = paths
                    .into_iter()
                    .filter(|path| !suppression.consume_path(path))
                    .collect::<Vec<_>>();

                if visible_paths.is_empty() {
                    continue;
                }

                if watcher_revision.load(Ordering::SeqCst) != revision {
                    return;
                }

                let payload = ProjectFilesChangedEvent {
                    project_path: project_path.clone(),
                    kind,
                    paths: visible_paths,
                };

                let _ = app_handle.emit_to("main", PROJECT_FILES_CHANGED_EVENT, payload);
            }
        }
    });

    ProjectWatcher {
        stop_tx,
        handle: Some(handle),
    }
}

fn snapshot_project_files(root: &Path) -> Result<ProjectSnapshot, String> {
    let mut snapshot = BTreeMap::new();

    for file in list_project_files(root)? {
        snapshot.insert(file.path, file.updated_at);
    }

    Ok(snapshot)
}

fn diff_snapshots(
    previous: &ProjectSnapshot,
    current: &ProjectSnapshot,
) -> Vec<(ProjectFilesChangedKind, Vec<String>)> {
    let mut added = Vec::new();
    let mut modified = Vec::new();
    let mut removed = Vec::new();

    for (path, updated_at) in current {
        match previous.get(path) {
            None => added.push(path.clone()),
            Some(previous_updated_at) if previous_updated_at != updated_at => {
                modified.push(path.clone())
            }
            Some(_) => {}
        }
    }

    for path in previous.keys() {
        if !current.contains_key(path) {
            removed.push(path.clone());
        }
    }

    let mut changes = Vec::new();

    if !added.is_empty() {
        changes.push((ProjectFilesChangedKind::Create, added));
    }

    if !modified.is_empty() {
        changes.push((ProjectFilesChangedKind::Modify, modified));
    }

    if !removed.is_empty() {
        changes.push((ProjectFilesChangedKind::Remove, removed));
    }

    changes
}

#[cfg(test)]
mod tests {
    use super::*;

    fn snapshot(paths: &[(&str, Option<u64>)]) -> ProjectSnapshot {
        paths
            .iter()
            .map(|(path, updated_at)| ((*path).to_string(), *updated_at))
            .collect()
    }

    #[test]
    fn diff_snapshots_groups_create_modify_and_remove_paths() {
        let previous = snapshot(&[
            ("drafts/chapter-1.md", Some(1)),
            ("drafts/chapter-2.md", Some(2)),
            ("drafts/chapter-3.md", Some(3)),
        ]);
        let current = snapshot(&[
            ("drafts/chapter-2.md", Some(4)),
            ("drafts/chapter-3.md", Some(3)),
            ("published/final.md", Some(5)),
        ]);

        let changes = diff_snapshots(&previous, &current);

        assert_eq!(
            changes,
            vec![
                (
                    ProjectFilesChangedKind::Create,
                    vec!["published/final.md".to_string()],
                ),
                (
                    ProjectFilesChangedKind::Modify,
                    vec!["drafts/chapter-2.md".to_string()],
                ),
                (
                    ProjectFilesChangedKind::Remove,
                    vec!["drafts/chapter-1.md".to_string()],
                ),
            ]
        );
    }

    #[test]
    fn suppression_consumes_each_path_once() {
        let suppression = SelfWriteSuppression::default();
        suppression.suppress_paths(["drafts/chapter-1.md".to_string()]);

        assert!(suppression.consume_path("drafts/chapter-1.md"));
        assert!(!suppression.consume_path("drafts/chapter-1.md"));
    }
}
