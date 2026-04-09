use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager, Runtime};

use super::{
    remote::sanitize_sync_settings,
    types::{LocalFileEntry, LocalSnapshot, SyncBaseline, SyncSettings},
    SyncResult,
};

pub(crate) fn ensure_config_dir<R: Runtime>(app: &AppHandle<R>) -> SyncResult<PathBuf> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|error| format!("无法定位应用配置目录：{error}"))?;
    fs::create_dir_all(&config_dir).map_err(|error| format!("无法创建配置目录：{error}"))?;
    Ok(config_dir)
}

pub(crate) fn ensure_baseline_dir(config_dir: &Path) -> SyncResult<PathBuf> {
    let dir = config_dir.join("sync-state");
    fs::create_dir_all(&dir).map_err(|error| format!("无法创建同步状态目录：{error}"))?;
    Ok(dir)
}

pub(crate) fn load_sync_settings_from_dir(config_dir: &Path) -> SyncResult<SyncSettings> {
    let path = settings_file_path(config_dir);
    if !path.exists() {
        return Ok(SyncSettings::default());
    }

    let raw = fs::read_to_string(&path).map_err(|error| format!("读取同步设置失败：{error}"))?;
    let settings = serde_json::from_str::<SyncSettings>(&raw)
        .map_err(|error| format!("解析同步设置失败：{error}"))?;
    sanitize_sync_settings(settings, false)
}

pub(crate) fn save_sync_settings_to_dir(
    config_dir: &Path,
    settings: SyncSettings,
) -> SyncResult<SyncSettings> {
    let sanitized = sanitize_sync_settings(settings, false)?;
    let raw = serde_json::to_string_pretty(&sanitized)
        .map_err(|error| format!("序列化同步设置失败：{error}"))?;
    fs::write(settings_file_path(config_dir), raw)
        .map_err(|error| format!("保存同步设置失败：{error}"))?;
    Ok(sanitized)
}

pub(crate) fn load_baseline(base_dir: &Path, project_root: &Path) -> SyncResult<SyncBaseline> {
    let path = baseline_file_path(base_dir, project_root);
    if !path.exists() {
        return Ok(SyncBaseline::default());
    }

    let raw = fs::read_to_string(&path).map_err(|error| format!("读取同步基线失败：{error}"))?;
    serde_json::from_str::<SyncBaseline>(&raw).map_err(|error| format!("解析同步基线失败：{error}"))
}

pub(crate) fn save_baseline(
    base_dir: &Path,
    project_root: &Path,
    baseline: &SyncBaseline,
) -> SyncResult<()> {
    let raw = serde_json::to_string_pretty(baseline)
        .map_err(|error| format!("序列化同步基线失败：{error}"))?;
    fs::write(baseline_file_path(base_dir, project_root), raw)
        .map_err(|error| format!("保存同步基线失败：{error}"))
}

pub(crate) fn scan_local_snapshot(root: &Path) -> SyncResult<LocalSnapshot> {
    let root = fs::canonicalize(root).map_err(|error| format!("项目目录不可访问：{error}"))?;
    let mut snapshot = LocalSnapshot::default();
    collect_local_entries(&root, &root, &mut snapshot)?;
    Ok(snapshot)
}

pub(crate) fn create_local_directory(project_root: &Path, relative_path: &str) -> SyncResult<()> {
    fs::create_dir_all(project_root.join(Path::new(relative_path)))
        .map_err(|error| format!("创建本地目录失败：{error}"))
}

pub(crate) fn delete_local_file(project_root: &Path, relative_path: &str) -> SyncResult<()> {
    let target_path = project_root.join(Path::new(relative_path));
    if !target_path.exists() {
        return Ok(());
    }

    fs::remove_file(&target_path).map_err(|error| format!("删除本地文件失败：{error}"))
}

pub(crate) fn delete_local_directory(project_root: &Path, relative_path: &str) -> SyncResult<()> {
    let target_path = project_root.join(Path::new(relative_path));
    if !target_path.exists() {
        return Ok(());
    }

    fs::remove_dir_all(&target_path).map_err(|error| format!("删除本地目录失败：{error}"))
}

pub(crate) fn hash_bytes(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    format!("{digest:x}")
}

pub(crate) fn current_timestamp_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock should be after unix epoch")
        .as_millis() as u64
}

fn settings_file_path(config_dir: &Path) -> PathBuf {
    config_dir.join("sync-settings.json")
}

fn baseline_file_path(base_dir: &Path, project_root: &Path) -> PathBuf {
    let hash = hash_bytes(project_root.to_string_lossy().as_bytes());
    base_dir.join(format!("{hash}.json"))
}

fn collect_local_entries(
    root: &Path,
    directory: &Path,
    snapshot: &mut LocalSnapshot,
) -> SyncResult<()> {
    let mut entries = fs::read_dir(directory)
        .map_err(|error| format!("扫描项目目录失败：{error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("读取项目目录失败：{error}"))?;
    entries.sort_by_key(|entry| entry.file_name().to_string_lossy().to_ascii_lowercase());

    for entry in entries {
        let path = entry.path();
        let file_type = entry
            .file_type()
            .map_err(|error| format!("读取项目目录失败：{error}"))?;

        if file_type.is_dir() {
            if entry.file_name().to_string_lossy() == ".git" {
                continue;
            }

            let relative_path = relative_path_from_root(root, &path)?;
            if !relative_path.is_empty() {
                snapshot.directories.insert(relative_path);
            }
            collect_local_entries(root, &path, snapshot)?;
            continue;
        }

        if !file_type.is_file() {
            continue;
        }

        let relative_path = relative_path_from_root(root, &path)?;
        let bytes = fs::read(&path).map_err(|error| format!("读取项目文件失败：{error}"))?;
        let modified_at = entry
            .metadata()
            .ok()
            .and_then(|metadata| metadata.modified().ok())
            .and_then(system_time_to_timestamp_millis);
        snapshot.files.insert(
            relative_path,
            LocalFileEntry {
                content_hash: hash_bytes(&bytes),
                modified_at,
            },
        );
    }

    Ok(())
}

fn relative_path_from_root(root: &Path, path: &Path) -> SyncResult<String> {
    let relative = path
        .strip_prefix(root)
        .map_err(|_| "文件路径超出项目目录".to_string())?;

    Ok(relative.to_string_lossy().replace('\\', "/"))
}

fn system_time_to_timestamp_millis(value: SystemTime) -> Option<u64> {
    value
        .duration_since(UNIX_EPOCH)
        .ok()
        .map(|duration| duration.as_millis() as u64)
}
