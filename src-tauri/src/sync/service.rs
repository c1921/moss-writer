use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::{Path, PathBuf},
};

use reqwest::Url;
use tauri::{AppHandle, Runtime};

use super::{
    planner::{
        build_resolve_plan, collect_pending_state, path_has_deleted_ancestor,
        resolve_operation_message, sorted_paths, sync_operation_message,
    },
    remote::{
        build_project_remote_url, delete_remote_directory, delete_remote_file,
        download_remote_file, ensure_remote_directory, ensure_remote_project_root,
        fetch_remote_file_hash, sanitize_sync_settings, upload_local_file, WebDavClient,
    },
    storage::{
        create_local_directory, current_timestamp_millis, delete_local_directory,
        delete_local_file, ensure_baseline_dir, ensure_config_dir, load_baseline,
        load_sync_settings_from_dir, save_baseline, save_sync_settings_to_dir, scan_local_snapshot,
    },
    types::{
        BaselineFileEntry, LocalSnapshot, PendingState, RemoteSnapshot, ResolveExecution,
        ResolvePlan, SyncBaseline, SyncDirection, SyncResolveStrategy, SyncResponse, SyncSettings,
    },
    SyncResult,
};

struct PreparedSession {
    project_root: PathBuf,
    baseline_dir: PathBuf,
    baseline: SyncBaseline,
    client: WebDavClient,
    project_url: Url,
    remote_snapshot: RemoteSnapshot,
}

pub fn load_sync_settings<R: Runtime>(app: &AppHandle<R>) -> SyncResult<SyncSettings> {
    let config_dir = ensure_config_dir(app)?;
    load_sync_settings_from_dir(&config_dir)
}

pub fn save_sync_settings<R: Runtime>(
    app: &AppHandle<R>,
    settings: SyncSettings,
) -> SyncResult<SyncSettings> {
    let config_dir = ensure_config_dir(app)?;
    save_sync_settings_to_dir(&config_dir, settings)
}

pub fn test_sync_connection(settings: SyncSettings) -> SyncResult<SyncResponse> {
    let settings = sanitize_sync_settings(settings, true)?;
    let client = WebDavClient::new(&settings)?;
    client.test_connection()?;

    Ok(SyncResponse {
        status: "success".to_string(),
        message: "WebDAV 连接成功".to_string(),
        changed_paths: Vec::new(),
        changed_directories: Vec::new(),
        conflicts: Vec::new(),
        skipped_deletion_paths: Vec::new(),
        pending_items: Vec::new(),
        synced_at: Some(current_timestamp_millis()),
    })
}

pub fn execute_sync_pull<R: Runtime>(
    app: &AppHandle<R>,
    project_root: &Path,
) -> SyncResult<SyncResponse> {
    execute_sync(app, project_root, SyncDirection::Pull)
}

pub fn execute_sync_push<R: Runtime>(
    app: &AppHandle<R>,
    project_root: &Path,
) -> SyncResult<SyncResponse> {
    execute_sync(app, project_root, SyncDirection::Push)
}

pub fn resolve_sync_pending<R: Runtime>(
    app: &AppHandle<R>,
    project_root: &Path,
    strategy: SyncResolveStrategy,
) -> SyncResult<SyncResponse> {
    let PreparedSession {
        project_root,
        baseline_dir,
        mut baseline,
        client,
        project_url,
        mut remote_snapshot,
    } = prepare_session(app, project_root)?;

    let local_snapshot = scan_local_snapshot(&project_root)?;
    let initial_pending_state =
        collect_pending_state(&client, &baseline, &local_snapshot, &remote_snapshot)?;
    let plan = build_resolve_plan(strategy, &initial_pending_state.items);

    if !remote_snapshot.root_exists
        && (!plan.upload_files.is_empty() || !plan.create_remote_directories.is_empty())
    {
        ensure_remote_project_root(&client, &project_root)?;
        remote_snapshot.root_exists = true;
    }

    let execution = apply_resolve_plan(
        &client,
        &project_url,
        &project_root,
        &remote_snapshot,
        &plan,
    )?;

    let (final_local_snapshot, final_remote_snapshot) = refresh_snapshots(
        &client,
        &project_url,
        &project_root,
        local_snapshot,
        remote_snapshot,
        !(execution.changed_paths.is_empty() && execution.changed_directories.is_empty()),
        execution.remote_mutated,
    )?;

    apply_baseline_changes(
        &mut baseline,
        &final_local_snapshot,
        &final_remote_snapshot,
        &execution.removed_file_paths,
        &execution.resolved_file_paths,
        &execution.removed_directories,
        &execution.resolved_directories,
    );

    save_baseline(&baseline_dir, &project_root, &baseline)?;
    let pending_state = collect_pending_state(
        &client,
        &baseline,
        &final_local_snapshot,
        &final_remote_snapshot,
    )?;
    let message =
        resolve_operation_message(strategy, plan.applied_item_count, pending_state.items.len());

    Ok(build_response(
        message,
        execution.changed_paths,
        execution.changed_directories,
        pending_state,
    ))
}

fn execute_sync<R: Runtime>(
    app: &AppHandle<R>,
    project_root: &Path,
    direction: SyncDirection,
) -> SyncResult<SyncResponse> {
    let PreparedSession {
        project_root,
        baseline_dir,
        mut baseline,
        client,
        project_url,
        mut remote_snapshot,
    } = prepare_session(app, project_root)?;

    if direction == SyncDirection::Push && !remote_snapshot.root_exists {
        ensure_remote_project_root(&client, &project_root)?;
        remote_snapshot.root_exists = true;
    }

    let local_snapshot = scan_local_snapshot(&project_root)?;
    let mut changed_paths = BTreeSet::new();
    let mut changed_directories = BTreeSet::new();
    let mut _conflicts = Vec::new();
    let mut _skipped_deletion_paths = BTreeSet::new();
    let mut resolved_file_paths = BTreeSet::new();
    let mut removed_file_paths = BTreeSet::new();
    let mut resolved_directories = BTreeSet::new();
    let mut removed_directories = BTreeSet::new();
    let mut remote_hash_cache = BTreeMap::new();

    let file_paths = collect_union_keys(
        baseline.files.keys(),
        local_snapshot.files.keys(),
        remote_snapshot.files.keys(),
    );

    let directory_paths = collect_union_keys(
        baseline.directories.iter(),
        local_snapshot.directories.iter(),
        remote_snapshot.directories.iter(),
    );

    for path in file_paths {
        let base = baseline.files.get(&path);
        let local = local_snapshot.files.get(&path);
        let remote = remote_snapshot.files.get(&path);

        let local_changed = match (base, local) {
            (Some(base), Some(local)) => local.content_hash != base.content_hash,
            (Some(_), None) => true,
            (None, Some(_)) => true,
            (None, None) => false,
        };
        let remote_changed = match (base, remote) {
            (Some(base), Some(remote)) => !base.remote_revision.matches(&remote.revision),
            (Some(_), None) => true,
            (None, Some(_)) => true,
            (None, None) => false,
        };

        match direction {
            SyncDirection::Pull => match (base, local, remote) {
                (None, None, Some(remote)) => {
                    download_remote_file(
                        &client,
                        remote,
                        &project_root,
                        &path,
                        &mut changed_paths,
                    )?;
                    resolved_file_paths.insert(path.clone());
                }
                (None, Some(_), None) => _conflicts.push(super::types::SyncConflict {
                    path: path.clone(),
                    reason: "localOnlyChange".to_string(),
                }),
                (None, Some(local), Some(remote)) => {
                    let remote_hash =
                        fetch_remote_file_hash(&client, remote, &path, &mut remote_hash_cache)?;
                    if remote_hash == local.content_hash {
                        resolved_file_paths.insert(path.clone());
                    } else {
                        _conflicts.push(super::types::SyncConflict {
                            path: path.clone(),
                            reason: "initialContentMismatch".to_string(),
                        });
                    }
                }
                (Some(_), Some(_), Some(_)) if !local_changed && !remote_changed => {}
                (Some(_), Some(_), Some(remote)) if !local_changed && remote_changed => {
                    download_remote_file(
                        &client,
                        remote,
                        &project_root,
                        &path,
                        &mut changed_paths,
                    )?;
                    resolved_file_paths.insert(path.clone());
                }
                (Some(_), Some(_), Some(_)) if local_changed && !remote_changed => {
                    _conflicts.push(super::types::SyncConflict {
                        path: path.clone(),
                        reason: "localOnlyChange".to_string(),
                    });
                }
                (Some(_), Some(local), Some(remote)) => {
                    let remote_hash =
                        fetch_remote_file_hash(&client, remote, &path, &mut remote_hash_cache)?;
                    if remote_hash == local.content_hash {
                        resolved_file_paths.insert(path.clone());
                    } else {
                        _conflicts.push(super::types::SyncConflict {
                            path: path.clone(),
                            reason: "bothModified".to_string(),
                        });
                    }
                }
                (Some(_), Some(_), None) if !local_changed => {
                    _skipped_deletion_paths.insert(path.clone());
                }
                (Some(_), Some(_), None) => _conflicts.push(super::types::SyncConflict {
                    path: path.clone(),
                    reason: "localModifiedRemoteDeleted".to_string(),
                }),
                (Some(_), None, Some(_)) if !remote_changed => {
                    _skipped_deletion_paths.insert(path.clone());
                }
                (Some(_), None, Some(_)) => _conflicts.push(super::types::SyncConflict {
                    path: path.clone(),
                    reason: "remoteModifiedLocalDeleted".to_string(),
                }),
                (Some(_), None, None) => {
                    removed_file_paths.insert(path.clone());
                }
                (None, None, None) => {}
            },
            SyncDirection::Push => match (base, local, remote) {
                (None, Some(_), None) => {
                    upload_local_file(
                        &client,
                        &project_url,
                        &project_root,
                        &path,
                        &mut remote_snapshot.directories,
                    )?;
                    changed_paths.insert(path.clone());
                    resolved_file_paths.insert(path.clone());
                }
                (None, None, Some(_)) => _conflicts.push(super::types::SyncConflict {
                    path: path.clone(),
                    reason: "remoteOnlyChange".to_string(),
                }),
                (None, Some(local), Some(remote)) => {
                    let remote_hash =
                        fetch_remote_file_hash(&client, remote, &path, &mut remote_hash_cache)?;
                    if remote_hash == local.content_hash {
                        resolved_file_paths.insert(path.clone());
                    } else {
                        _conflicts.push(super::types::SyncConflict {
                            path: path.clone(),
                            reason: "initialContentMismatch".to_string(),
                        });
                    }
                }
                (Some(_), Some(_), Some(_)) if !local_changed && !remote_changed => {}
                (Some(_), Some(_), Some(_)) if local_changed && !remote_changed => {
                    upload_local_file(
                        &client,
                        &project_url,
                        &project_root,
                        &path,
                        &mut remote_snapshot.directories,
                    )?;
                    changed_paths.insert(path.clone());
                    resolved_file_paths.insert(path.clone());
                }
                (Some(_), Some(_), Some(_)) if !local_changed && remote_changed => {
                    _conflicts.push(super::types::SyncConflict {
                        path: path.clone(),
                        reason: "remoteOnlyChange".to_string(),
                    });
                }
                (Some(_), Some(local), Some(remote)) => {
                    let remote_hash =
                        fetch_remote_file_hash(&client, remote, &path, &mut remote_hash_cache)?;
                    if remote_hash == local.content_hash {
                        resolved_file_paths.insert(path.clone());
                    } else {
                        _conflicts.push(super::types::SyncConflict {
                            path: path.clone(),
                            reason: "bothModified".to_string(),
                        });
                    }
                }
                (Some(_), Some(_), None) if !local_changed => {
                    _skipped_deletion_paths.insert(path.clone());
                }
                (Some(_), Some(_), None) => _conflicts.push(super::types::SyncConflict {
                    path: path.clone(),
                    reason: "localModifiedRemoteDeleted".to_string(),
                }),
                (Some(_), None, Some(_)) if !remote_changed => {
                    _skipped_deletion_paths.insert(path.clone());
                }
                (Some(_), None, Some(_)) => _conflicts.push(super::types::SyncConflict {
                    path: path.clone(),
                    reason: "remoteModifiedLocalDeleted".to_string(),
                }),
                (Some(_), None, None) => {
                    removed_file_paths.insert(path.clone());
                }
                (None, None, None) => {}
            },
        }
    }

    for path in directory_paths {
        let in_base = baseline.directories.contains(&path);
        let in_local = local_snapshot.directories.contains(&path);
        let in_remote = remote_snapshot.directories.contains(&path);

        match direction {
            SyncDirection::Pull => match (in_base, in_local, in_remote) {
                (false, false, true) => {
                    create_local_directory(&project_root, &path)?;
                    changed_directories.insert(path.clone());
                    resolved_directories.insert(path.clone());
                }
                (true, true, false) | (true, false, true) => {
                    _skipped_deletion_paths.insert(path.clone());
                }
                (true, false, false) => {
                    removed_directories.insert(path.clone());
                }
                (true, true, true)
                | (false, true, false)
                | (false, true, true)
                | (false, false, false) => {}
            },
            SyncDirection::Push => match (in_base, in_local, in_remote) {
                (false, true, false) => {
                    ensure_remote_directory(
                        &client,
                        &project_url,
                        &path,
                        &mut remote_snapshot.directories,
                    )?;
                    changed_directories.insert(path.clone());
                    resolved_directories.insert(path.clone());
                }
                (true, true, false) | (true, false, true) => {
                    _skipped_deletion_paths.insert(path.clone());
                }
                (true, false, false) => {
                    removed_directories.insert(path.clone());
                }
                (true, true, true)
                | (false, false, true)
                | (false, true, true)
                | (false, false, false) => {}
            },
        }
    }

    let (final_local_snapshot, final_remote_snapshot) = refresh_snapshots(
        &client,
        &project_url,
        &project_root,
        local_snapshot,
        remote_snapshot,
        true,
        matches!(direction, SyncDirection::Push)
            || !changed_paths.is_empty()
            || !changed_directories.is_empty(),
    )?;

    apply_baseline_changes(
        &mut baseline,
        &final_local_snapshot,
        &final_remote_snapshot,
        &removed_file_paths,
        &resolved_file_paths,
        &removed_directories,
        &resolved_directories,
    );

    save_baseline(&baseline_dir, &project_root, &baseline)?;
    let pending_state = collect_pending_state(
        &client,
        &baseline,
        &final_local_snapshot,
        &final_remote_snapshot,
    )?;

    let applied_count = changed_paths.len() + changed_directories.len();
    let message = sync_operation_message(direction, applied_count, pending_state.items.len());

    Ok(build_response(
        message,
        changed_paths,
        changed_directories,
        PendingState {
            items: pending_state.items,
            conflicts: pending_state.conflicts,
            skipped_deletion_paths: pending_state.skipped_deletion_paths,
        },
    ))
}

fn prepare_session<R: Runtime>(
    app: &AppHandle<R>,
    project_root: &Path,
) -> SyncResult<PreparedSession> {
    let config_dir = ensure_config_dir(app)?;
    let settings = load_sync_settings_from_dir(&config_dir)?;
    let settings = sanitize_sync_settings(settings, true)?;

    if !settings.enabled {
        return Err("请先在设置中启用 WebDAV 同步".to_string());
    }

    let project_root =
        fs::canonicalize(project_root).map_err(|error| format!("项目目录不可访问：{error}"))?;
    let baseline_dir = ensure_baseline_dir(&config_dir)?;
    let baseline = load_baseline(&baseline_dir, &project_root)?;
    let client = WebDavClient::new(&settings)?;
    let project_url = build_project_remote_url(client.root_url(), &project_root)?;
    let remote_snapshot = client.list_tree(&project_url)?;

    Ok(PreparedSession {
        project_root,
        baseline_dir,
        baseline,
        client,
        project_url,
        remote_snapshot,
    })
}

fn refresh_snapshots(
    client: &WebDavClient,
    project_url: &Url,
    project_root: &Path,
    local_snapshot: LocalSnapshot,
    remote_snapshot: RemoteSnapshot,
    refresh_local: bool,
    refresh_remote: bool,
) -> SyncResult<(LocalSnapshot, RemoteSnapshot)> {
    let final_local_snapshot = if refresh_local {
        scan_local_snapshot(project_root)?
    } else {
        local_snapshot
    };
    let final_remote_snapshot = if refresh_remote {
        client.list_tree(project_url)?
    } else {
        remote_snapshot
    };

    Ok((final_local_snapshot, final_remote_snapshot))
}

fn apply_baseline_changes(
    baseline: &mut SyncBaseline,
    final_local_snapshot: &LocalSnapshot,
    final_remote_snapshot: &RemoteSnapshot,
    removed_file_paths: &BTreeSet<String>,
    resolved_file_paths: &BTreeSet<String>,
    removed_directories: &BTreeSet<String>,
    resolved_directories: &BTreeSet<String>,
) {
    for path in removed_file_paths {
        baseline.files.remove(path);
    }

    for path in resolved_file_paths {
        if let (Some(local), Some(remote)) = (
            final_local_snapshot.files.get(path),
            final_remote_snapshot.files.get(path),
        ) {
            baseline.files.insert(
                path.clone(),
                BaselineFileEntry {
                    content_hash: local.content_hash.clone(),
                    remote_revision: remote.revision.clone(),
                },
            );
        }
    }

    for path in removed_directories {
        baseline.directories.remove(path);
    }

    for path in resolved_directories {
        if final_local_snapshot.directories.contains(path)
            && final_remote_snapshot.directories.contains(path)
        {
            baseline.directories.insert(path.clone());
        }
    }
}

fn build_response(
    message: String,
    changed_paths: BTreeSet<String>,
    changed_directories: BTreeSet<String>,
    pending_state: PendingState,
) -> SyncResponse {
    SyncResponse {
        status: if pending_state.items.is_empty() {
            "success".to_string()
        } else {
            "warning".to_string()
        },
        message,
        changed_paths: changed_paths.into_iter().collect(),
        changed_directories: changed_directories.into_iter().collect(),
        conflicts: pending_state.conflicts,
        skipped_deletion_paths: pending_state.skipped_deletion_paths,
        pending_items: pending_state.items,
        synced_at: Some(current_timestamp_millis()),
    }
}

fn apply_resolve_plan(
    client: &WebDavClient,
    project_url: &Url,
    project_root: &Path,
    remote_snapshot: &RemoteSnapshot,
    plan: &ResolvePlan,
) -> SyncResult<ResolveExecution> {
    let mut execution = ResolveExecution {
        resolved_file_paths: plan.resolved_file_paths.clone(),
        removed_file_paths: plan.removed_file_paths.clone(),
        resolved_directories: plan.resolved_directory_paths.clone(),
        removed_directories: plan.removed_directory_paths.clone(),
        ..ResolveExecution::default()
    };
    let mut existing_remote_directories = remote_snapshot.directories.clone();

    for path in sorted_paths(&plan.create_remote_directories, false) {
        ensure_remote_directory(client, project_url, &path, &mut existing_remote_directories)?;
        execution.remote_mutated = true;
    }

    for path in sorted_paths(&plan.create_local_directories, false) {
        create_local_directory(project_root, &path)?;
        execution.changed_directories.insert(path);
    }

    for path in plan.upload_files.iter().cloned().collect::<Vec<_>>() {
        upload_local_file(
            client,
            project_url,
            project_root,
            &path,
            &mut existing_remote_directories,
        )?;
        execution.remote_mutated = true;
    }

    for path in plan.download_files.iter().cloned().collect::<Vec<_>>() {
        let remote = remote_snapshot
            .files
            .get(&path)
            .ok_or_else(|| format!("远端文件不存在：{path}"))?;
        download_remote_file(
            client,
            remote,
            project_root,
            &path,
            &mut execution.changed_paths,
        )?;
    }

    for path in plan.delete_local_files.iter().cloned().collect::<Vec<_>>() {
        if path_has_deleted_ancestor(&path, &plan.delete_local_directories) {
            continue;
        }

        delete_local_file(project_root, &path)?;
        execution.changed_paths.insert(path);
    }

    for path in plan.delete_remote_files.iter().cloned().collect::<Vec<_>>() {
        if path_has_deleted_ancestor(&path, &plan.delete_remote_directories) {
            continue;
        }

        delete_remote_file(client, remote_snapshot, &path)?;
        execution.remote_mutated = true;
    }

    for path in sorted_paths(&plan.delete_local_directories, true) {
        if path_has_deleted_ancestor(&path, &plan.delete_local_directories) {
            continue;
        }

        delete_local_directory(project_root, &path)?;
        execution.changed_directories.insert(path);
    }

    for path in sorted_paths(&plan.delete_remote_directories, true) {
        if path_has_deleted_ancestor(&path, &plan.delete_remote_directories) {
            continue;
        }

        delete_remote_directory(client, project_url, &path)?;
        execution.remote_mutated = true;
    }

    Ok(execution)
}

fn collect_union_keys<'a, I1, I2, I3>(first: I1, second: I2, third: I3) -> BTreeSet<String>
where
    I1: IntoIterator<Item = &'a String>,
    I2: IntoIterator<Item = &'a String>,
    I3: IntoIterator<Item = &'a String>,
{
    let mut keys = BTreeSet::new();
    for collection in [
        first.into_iter().collect::<Vec<_>>(),
        second.into_iter().collect::<Vec<_>>(),
        third.into_iter().collect::<Vec<_>>(),
    ] {
        for key in collection {
            keys.insert(key.clone());
        }
    }
    keys
}
