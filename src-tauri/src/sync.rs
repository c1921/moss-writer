use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use percent_encoding::percent_decode_str;
use reqwest::{
    blocking::Client,
    header::{HeaderMap, HeaderValue, CONTENT_TYPE},
    Method, StatusCode, Url,
};
use roxmltree::Document;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager, Runtime};

type SyncResult<T> = Result<T, String>;

const APP_REMOTE_ROOT_SEGMENT: &str = "MossWriter";
const PROPFIND_REQUEST_BODY: &str = r#"<?xml version="1.0" encoding="utf-8"?>
<propfind xmlns="DAV:">
  <prop>
    <resourcetype />
    <getetag />
    <getlastmodified />
    <getcontentlength />
  </prop>
</propfind>"#;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SyncSettings {
    pub enabled: bool,
    pub root_url: String,
    pub username: String,
    pub password: String,
    pub auto_pull_on_open: bool,
    pub auto_push_on_save: bool,
    pub auto_push_min_interval_seconds: u64,
}

impl Default for SyncSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            root_url: String::new(),
            username: String::new(),
            password: String::new(),
            auto_pull_on_open: true,
            auto_push_on_save: true,
            auto_push_min_interval_seconds: 120,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SyncConflict {
    pub path: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SyncResponse {
    pub status: String,
    pub message: String,
    pub changed_paths: Vec<String>,
    pub changed_directories: Vec<String>,
    pub conflicts: Vec<SyncConflict>,
    pub skipped_deletion_paths: Vec<String>,
    pub synced_at: Option<u64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct SyncBaseline {
    files: BTreeMap<String, BaselineFileEntry>,
    directories: BTreeSet<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct BaselineFileEntry {
    content_hash: String,
    remote_revision: RemoteRevision,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct RemoteRevision {
    etag: Option<String>,
    last_modified: Option<String>,
    size: Option<u64>,
}

#[derive(Debug, Clone)]
struct LocalFileEntry {
    content_hash: String,
}

#[derive(Debug, Clone, Default)]
struct LocalSnapshot {
    files: BTreeMap<String, LocalFileEntry>,
    directories: BTreeSet<String>,
}

#[derive(Debug, Clone)]
struct RemoteFileEntry {
    file_url: Url,
    revision: RemoteRevision,
}

#[derive(Debug, Clone, Default)]
struct RemoteSnapshot {
    root_exists: bool,
    files: BTreeMap<String, RemoteFileEntry>,
    directories: BTreeSet<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SyncDirection {
    Pull,
    Push,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum RemoteTreeLookup {
    Found,
    Missing,
}

struct WebDavClient {
    root_url: Url,
    username: String,
    password: String,
    client: Client,
}

impl WebDavClient {
    fn new(settings: &SyncSettings) -> SyncResult<Self> {
        let root_url = parse_root_url(&settings.root_url)?;
        let client = Client::builder()
            .build()
            .map_err(|error| format!("无法初始化 WebDAV 客户端：{error}"))?;

        Ok(Self {
            root_url,
            username: settings.username.clone(),
            password: settings.password.clone(),
            client,
        })
    }

    fn test_connection(&self) -> SyncResult<()> {
        let response = self
            .request(propfind_method(), self.root_url.clone())
            .headers(propfind_headers())
            .body(PROPFIND_REQUEST_BODY.to_string())
            .send()
            .map_err(|error| format!("WebDAV 连接失败：{error}"))?;

        match response.status() {
            status if status.as_u16() == 207 || status == StatusCode::OK => Ok(()),
            StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => {
                Err("WebDAV 认证失败，请检查账号或密码".to_string())
            }
            status => Err(format!("WebDAV 测试连接失败：HTTP {}", status.as_u16())),
        }
    }

    fn list_tree(&self, project_url: &Url) -> SyncResult<RemoteSnapshot> {
        let response = self
            .request(propfind_method(), project_url.clone())
            .headers(propfind_headers())
            .body(PROPFIND_REQUEST_BODY.to_string())
            .send()
            .map_err(|error| format!("读取 WebDAV 目录失败：{error}"))?;

        if classify_remote_tree_lookup(response.status())? == RemoteTreeLookup::Missing {
            return Ok(RemoteSnapshot::default());
        }

        let body = response
            .text()
            .map_err(|error| format!("读取 WebDAV 响应失败：{error}"))?;
        parse_remote_tree_response(&body, project_url)
    }

    fn get_file(&self, file_url: &Url) -> SyncResult<Vec<u8>> {
        let response = self
            .request(Method::GET, file_url.clone())
            .send()
            .map_err(|error| format!("下载远端文件失败：{error}"))?;

        if response.status() != StatusCode::OK {
            return Err(format!(
                "下载远端文件失败：HTTP {}",
                response.status().as_u16()
            ));
        }

        response
            .bytes()
            .map(|bytes| bytes.to_vec())
            .map_err(|error| format!("读取远端文件失败：{error}"))
    }

    fn put_file(&self, file_url: &Url, bytes: Vec<u8>) -> SyncResult<()> {
        let response = self
            .request(Method::PUT, file_url.clone())
            .body(bytes)
            .send()
            .map_err(|error| format!("上传远端文件失败：{error}"))?;

        match response.status() {
            StatusCode::OK | StatusCode::CREATED | StatusCode::NO_CONTENT => Ok(()),
            status => Err(format!("上传远端文件失败：HTTP {}", status.as_u16())),
        }
    }

    fn mkcol(&self, directory_url: &Url) -> SyncResult<()> {
        let response = self
            .request(mkcol_method(), directory_url.clone())
            .send()
            .map_err(|error| format!("创建远端目录失败：{error}"))?;

        match response.status() {
            StatusCode::OK
            | StatusCode::CREATED
            | StatusCode::NO_CONTENT
            | StatusCode::METHOD_NOT_ALLOWED => Ok(()),
            StatusCode::CONFLICT => Err(
                "创建远端目录失败：HTTP 409，请确认 WebDAV 根地址指向可写目录，并且服务器允许在该位置创建子目录"
                    .to_string(),
            ),
            status => Err(format!("创建远端目录失败：HTTP {}", status.as_u16())),
        }
    }

    fn request(&self, method: Method, url: Url) -> reqwest::blocking::RequestBuilder {
        self.client
            .request(method, url)
            .basic_auth(&self.username, Some(&self.password))
    }
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

fn execute_sync<R: Runtime>(
    app: &AppHandle<R>,
    project_root: &Path,
    direction: SyncDirection,
) -> SyncResult<SyncResponse> {
    let config_dir = ensure_config_dir(app)?;
    let settings = load_sync_settings_from_dir(&config_dir)?;
    let settings = sanitize_sync_settings(settings, true)?;

    if !settings.enabled {
        return Err("请先在设置中启用 WebDAV 同步".to_string());
    }

    let project_root =
        fs::canonicalize(project_root).map_err(|error| format!("项目目录不可访问：{error}"))?;
    let baseline_dir = ensure_baseline_dir(&config_dir)?;
    let mut baseline = load_baseline(&baseline_dir, &project_root)?;
    let client = WebDavClient::new(&settings)?;
    let project_url = build_project_remote_url(&client.root_url, &project_root)?;
    let mut remote_snapshot = client.list_tree(&project_url)?;

    if direction == SyncDirection::Push && !remote_snapshot.root_exists {
        ensure_remote_project_root(&client, &project_root)?;
        remote_snapshot.root_exists = true;
    }

    let local_snapshot = scan_local_snapshot(&project_root)?;
    let mut changed_paths = BTreeSet::new();
    let mut changed_directories = BTreeSet::new();
    let mut conflicts = Vec::new();
    let mut skipped_deletion_paths = BTreeSet::new();
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
                (None, Some(_), None) => conflicts.push(SyncConflict {
                    path: path.clone(),
                    reason: "localOnlyChange".to_string(),
                }),
                (None, Some(local), Some(remote)) => {
                    let remote_hash =
                        fetch_remote_file_hash(&client, remote, &path, &mut remote_hash_cache)?;
                    if remote_hash == local.content_hash {
                        resolved_file_paths.insert(path.clone());
                    } else {
                        conflicts.push(SyncConflict {
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
                    conflicts.push(SyncConflict {
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
                        conflicts.push(SyncConflict {
                            path: path.clone(),
                            reason: "bothModified".to_string(),
                        });
                    }
                }
                (Some(_), Some(_), None) if !local_changed => {
                    skipped_deletion_paths.insert(path.clone());
                }
                (Some(_), Some(_), None) => conflicts.push(SyncConflict {
                    path: path.clone(),
                    reason: "localModifiedRemoteDeleted".to_string(),
                }),
                (Some(_), None, Some(_)) if !remote_changed => {
                    skipped_deletion_paths.insert(path.clone());
                }
                (Some(_), None, Some(_)) => conflicts.push(SyncConflict {
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
                (None, None, Some(_)) => conflicts.push(SyncConflict {
                    path: path.clone(),
                    reason: "remoteOnlyChange".to_string(),
                }),
                (None, Some(local), Some(remote)) => {
                    let remote_hash =
                        fetch_remote_file_hash(&client, remote, &path, &mut remote_hash_cache)?;
                    if remote_hash == local.content_hash {
                        resolved_file_paths.insert(path.clone());
                    } else {
                        conflicts.push(SyncConflict {
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
                    conflicts.push(SyncConflict {
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
                        conflicts.push(SyncConflict {
                            path: path.clone(),
                            reason: "bothModified".to_string(),
                        });
                    }
                }
                (Some(_), Some(_), None) if !local_changed => {
                    skipped_deletion_paths.insert(path.clone());
                }
                (Some(_), Some(_), None) => conflicts.push(SyncConflict {
                    path: path.clone(),
                    reason: "localModifiedRemoteDeleted".to_string(),
                }),
                (Some(_), None, Some(_)) if !remote_changed => {
                    skipped_deletion_paths.insert(path.clone());
                }
                (Some(_), None, Some(_)) => conflicts.push(SyncConflict {
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
                    skipped_deletion_paths.insert(path.clone());
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
                    skipped_deletion_paths.insert(path.clone());
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

    let final_local_snapshot = scan_local_snapshot(&project_root)?;
    let final_remote_snapshot = if matches!(direction, SyncDirection::Push)
        || !changed_paths.is_empty()
        || !changed_directories.is_empty()
    {
        client.list_tree(&project_url)?
    } else {
        remote_snapshot
    };

    for path in removed_file_paths {
        baseline.files.remove(&path);
    }

    for path in resolved_file_paths {
        if let (Some(local), Some(remote)) = (
            final_local_snapshot.files.get(&path),
            final_remote_snapshot.files.get(&path),
        ) {
            baseline.files.insert(
                path,
                BaselineFileEntry {
                    content_hash: local.content_hash.clone(),
                    remote_revision: remote.revision.clone(),
                },
            );
        }
    }

    for path in removed_directories {
        baseline.directories.remove(&path);
    }

    for path in resolved_directories {
        if final_local_snapshot.directories.contains(&path)
            && final_remote_snapshot.directories.contains(&path)
        {
            baseline.directories.insert(path);
        }
    }

    save_baseline(&baseline_dir, &project_root, &baseline)?;

    let changed_paths = changed_paths.into_iter().collect::<Vec<_>>();
    let changed_directories = changed_directories.into_iter().collect::<Vec<_>>();
    let skipped_deletion_paths = skipped_deletion_paths.into_iter().collect::<Vec<_>>();
    let has_warnings = !conflicts.is_empty() || !skipped_deletion_paths.is_empty();
    let applied_count = changed_paths.len() + changed_directories.len();

    let message = match (direction, applied_count, has_warnings) {
        (SyncDirection::Pull, 0, false) => "没有需要拉取的更新".to_string(),
        (SyncDirection::Push, 0, false) => "没有需要推送的更新".to_string(),
        (SyncDirection::Pull, _, false) => format!("已拉取 {applied_count} 项更新"),
        (SyncDirection::Push, _, false) => format!("已推送 {applied_count} 项更新"),
        (SyncDirection::Pull, 0, true) => "拉取完成，但有未自动处理的差异".to_string(),
        (SyncDirection::Push, 0, true) => "推送完成，但有未自动处理的差异".to_string(),
        (SyncDirection::Pull, _, true) => {
            format!("已拉取 {applied_count} 项更新，但仍有未自动处理的差异")
        }
        (SyncDirection::Push, _, true) => {
            format!("已推送 {applied_count} 项更新，但仍有未自动处理的差异")
        }
    };

    Ok(SyncResponse {
        status: if has_warnings {
            "warning".to_string()
        } else {
            "success".to_string()
        },
        message,
        changed_paths,
        changed_directories,
        conflicts,
        skipped_deletion_paths,
        synced_at: Some(current_timestamp_millis()),
    })
}

fn sanitize_sync_settings(
    settings: SyncSettings,
    require_enabled: bool,
) -> SyncResult<SyncSettings> {
    let mut sanitized = settings;
    sanitized.root_url = sanitized.root_url.trim().to_string();
    sanitized.username = sanitized.username.trim().to_string();
    sanitized.auto_push_min_interval_seconds = sanitized.auto_push_min_interval_seconds.max(30);

    let should_validate = require_enabled || sanitized.enabled;
    if !should_validate {
        return Ok(sanitized);
    }

    if sanitized.root_url.is_empty() {
        return Err("WebDAV 地址不能为空".to_string());
    }

    let parsed = parse_root_url(&sanitized.root_url)?;
    if sanitized.username.is_empty() {
        return Err("WebDAV 用户名不能为空".to_string());
    }
    if sanitized.password.is_empty() {
        return Err("WebDAV 密码不能为空".to_string());
    }

    sanitized.root_url = normalize_root_url(&parsed);
    Ok(sanitized)
}

fn parse_root_url(root_url: &str) -> SyncResult<Url> {
    let parsed = Url::parse(root_url).map_err(|error| format!("WebDAV 地址格式不正确：{error}"))?;

    match parsed.scheme() {
        "http" | "https" => Ok(parsed),
        _ => Err("WebDAV 地址必须使用 http 或 https".to_string()),
    }
}

fn normalize_root_url(url: &Url) -> String {
    let value = url.as_str().trim_end_matches('/');
    if value.is_empty() {
        url.as_str().to_string()
    } else {
        value.to_string()
    }
}

fn propfind_method() -> Method {
    Method::from_bytes(b"PROPFIND").expect("PROPFIND should be a valid HTTP method")
}

fn mkcol_method() -> Method {
    Method::from_bytes(b"MKCOL").expect("MKCOL should be a valid HTTP method")
}

fn classify_remote_tree_lookup(status: StatusCode) -> SyncResult<RemoteTreeLookup> {
    match status {
        status if status.as_u16() == 207 || status == StatusCode::OK => Ok(RemoteTreeLookup::Found),
        StatusCode::NOT_FOUND | StatusCode::CONFLICT => Ok(RemoteTreeLookup::Missing),
        status => Err(format!("读取 WebDAV 目录失败：HTTP {}", status.as_u16())),
    }
}

fn propfind_headers() -> HeaderMap {
    let mut headers = HeaderMap::new();
    headers.insert("Depth", HeaderValue::from_static("infinity"));
    headers.insert(
        CONTENT_TYPE,
        HeaderValue::from_static("application/xml; charset=utf-8"),
    );
    headers
}

fn ensure_config_dir<R: Runtime>(app: &AppHandle<R>) -> SyncResult<PathBuf> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|error| format!("无法定位应用配置目录：{error}"))?;
    fs::create_dir_all(&config_dir).map_err(|error| format!("无法创建配置目录：{error}"))?;
    Ok(config_dir)
}

fn settings_file_path(config_dir: &Path) -> PathBuf {
    config_dir.join("sync-settings.json")
}

fn baseline_file_path(base_dir: &Path, project_root: &Path) -> PathBuf {
    let hash = hash_bytes(project_root.to_string_lossy().as_bytes());
    base_dir.join(format!("{hash}.json"))
}

fn ensure_baseline_dir(config_dir: &Path) -> SyncResult<PathBuf> {
    let dir = config_dir.join("sync-state");
    fs::create_dir_all(&dir).map_err(|error| format!("无法创建同步状态目录：{error}"))?;
    Ok(dir)
}

fn load_sync_settings_from_dir(config_dir: &Path) -> SyncResult<SyncSettings> {
    let path = settings_file_path(config_dir);
    if !path.exists() {
        return Ok(SyncSettings::default());
    }

    let raw = fs::read_to_string(&path).map_err(|error| format!("读取同步设置失败：{error}"))?;
    let settings = serde_json::from_str::<SyncSettings>(&raw)
        .map_err(|error| format!("解析同步设置失败：{error}"))?;
    sanitize_sync_settings(settings, false)
}

fn save_sync_settings_to_dir(
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

fn load_baseline(base_dir: &Path, project_root: &Path) -> SyncResult<SyncBaseline> {
    let path = baseline_file_path(base_dir, project_root);
    if !path.exists() {
        return Ok(SyncBaseline::default());
    }

    let raw = fs::read_to_string(&path).map_err(|error| format!("读取同步基线失败：{error}"))?;
    serde_json::from_str::<SyncBaseline>(&raw).map_err(|error| format!("解析同步基线失败：{error}"))
}

fn save_baseline(base_dir: &Path, project_root: &Path, baseline: &SyncBaseline) -> SyncResult<()> {
    let raw = serde_json::to_string_pretty(baseline)
        .map_err(|error| format!("序列化同步基线失败：{error}"))?;
    fs::write(baseline_file_path(base_dir, project_root), raw)
        .map_err(|error| format!("保存同步基线失败：{error}"))
}

fn scan_local_snapshot(root: &Path) -> SyncResult<LocalSnapshot> {
    let root = fs::canonicalize(root).map_err(|error| format!("项目目录不可访问：{error}"))?;
    let mut snapshot = LocalSnapshot::default();
    collect_local_entries(&root, &root, &mut snapshot)?;
    Ok(snapshot)
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
        snapshot.files.insert(
            relative_path,
            LocalFileEntry {
                content_hash: hash_bytes(&bytes),
            },
        );
    }

    Ok(())
}

fn build_project_remote_url(base_root: &Url, project_root: &Path) -> SyncResult<Url> {
    let project_name = project_root
        .file_name()
        .and_then(|value| value.to_str())
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "无法解析项目名称".to_string())?;

    join_url(base_root, &[APP_REMOTE_ROOT_SEGMENT, project_name])
}

fn join_url(base: &Url, segments: &[&str]) -> SyncResult<Url> {
    let mut url = base.clone();
    let mut path_segments = url
        .path_segments_mut()
        .map_err(|_| "WebDAV 地址不支持路径拼接".to_string())?;

    for segment in segments {
        let trimmed = segment.trim_matches('/');
        if trimmed.is_empty() {
            continue;
        }

        path_segments.push(trimmed);
    }

    drop(path_segments);
    Ok(url)
}

fn collect_url_segments(url: &Url) -> Vec<String> {
    url.path_segments()
        .map(|segments| {
            segments
                .filter(|segment| !segment.is_empty())
                .map(str::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

fn collection_base_url(url: &Url) -> SyncResult<Url> {
    if url.as_str().ends_with('/') {
        return Ok(url.clone());
    }

    Url::parse(&format!("{}/", url.as_str()))
        .map_err(|error| format!("WebDAV 地址格式不正确：{error}"))
}

fn resolve_webdav_href(project_url: &Url, href: &str) -> SyncResult<Url> {
    let trimmed = href.trim();
    if trimmed.is_empty() {
        return Err("WebDAV 返回了空路径".to_string());
    }

    collection_base_url(project_url)?
        .join(trimmed)
        .map_err(|error| format!("WebDAV 返回了无法识别的路径：{error}"))
}

fn decode_url_segment(segment: &str) -> SyncResult<String> {
    percent_decode_str(segment)
        .decode_utf8()
        .map(|value| value.into_owned())
        .map_err(|error| format!("WebDAV 返回了无法解码的路径：{error}"))
}

fn parse_remote_tree_response(body: &str, project_url: &Url) -> SyncResult<RemoteSnapshot> {
    let document =
        Document::parse(body).map_err(|error| format!("解析 WebDAV 响应失败：{error}"))?;
    let root_segments = collect_url_segments(project_url);
    let mut snapshot = RemoteSnapshot {
        root_exists: true,
        ..RemoteSnapshot::default()
    };

    for response_node in document
        .descendants()
        .filter(|node| node.is_element() && node.tag_name().name() == "response")
    {
        let Some(href) = find_child_text(response_node, "href") else {
            continue;
        };

        let resolved_url = resolve_webdav_href(project_url, &href)?;
        let response_segments = collect_url_segments(&resolved_url);

        if response_segments.len() < root_segments.len()
            || !response_segments
                .iter()
                .zip(root_segments.iter())
                .all(|(left, right)| left == right)
        {
            continue;
        }

        let relative_segments = response_segments[root_segments.len()..]
            .iter()
            .map(|segment| decode_url_segment(segment))
            .collect::<SyncResult<Vec<_>>>()?;
        if relative_segments.is_empty() {
            continue;
        }
        if relative_segments
            .iter()
            .any(|segment| segment == "." || segment == "..")
        {
            return Err("WebDAV 返回了非法路径".to_string());
        }

        let relative_path = relative_segments.join("/");
        let is_directory = response_node
            .descendants()
            .any(|node| node.is_element() && node.tag_name().name() == "collection");

        if is_directory {
            snapshot.directories.insert(relative_path);
            continue;
        }

        let revision = RemoteRevision {
            etag: find_descendant_text(response_node, "getetag"),
            last_modified: find_descendant_text(response_node, "getlastmodified"),
            size: find_descendant_text(response_node, "getcontentlength")
                .and_then(|value| value.parse::<u64>().ok()),
        };

        snapshot.files.insert(
            relative_path,
            RemoteFileEntry {
                file_url: resolved_url,
                revision,
            },
        );
    }

    Ok(snapshot)
}

fn ensure_remote_project_root(client: &WebDavClient, project_root: &Path) -> SyncResult<()> {
    let project_name = project_root
        .file_name()
        .and_then(|value| value.to_str())
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "无法解析项目名称".to_string())?;

    let app_root_url = join_url(&client.root_url, &[APP_REMOTE_ROOT_SEGMENT])?;
    client.mkcol(&app_root_url)?;

    let project_url = join_url(&client.root_url, &[APP_REMOTE_ROOT_SEGMENT, project_name])?;
    client.mkcol(&project_url)
}

fn ensure_remote_directory(
    client: &WebDavClient,
    project_url: &Url,
    relative_directory: &str,
    existing_directories: &mut BTreeSet<String>,
) -> SyncResult<()> {
    let mut path_accumulator = Vec::new();
    for segment in relative_directory
        .split('/')
        .filter(|segment| !segment.is_empty())
    {
        path_accumulator.push(segment);
        let joined = path_accumulator.join("/");
        if existing_directories.contains(&joined) {
            continue;
        }

        let directory_url = join_relative_path(project_url, &joined)?;
        client.mkcol(&directory_url)?;
        existing_directories.insert(joined);
    }

    Ok(())
}

fn upload_local_file(
    client: &WebDavClient,
    project_url: &Url,
    project_root: &Path,
    relative_path: &str,
    existing_directories: &mut BTreeSet<String>,
) -> SyncResult<()> {
    if let Some(parent) = parent_directory(relative_path) {
        ensure_remote_directory(client, project_url, &parent, existing_directories)?;
    }

    let bytes = fs::read(project_root.join(Path::new(relative_path)))
        .map_err(|error| format!("读取本地文件失败：{error}"))?;
    let file_url = join_relative_path(project_url, relative_path)?;
    client.put_file(&file_url, bytes)
}

fn download_remote_file(
    client: &WebDavClient,
    remote: &RemoteFileEntry,
    project_root: &Path,
    relative_path: &str,
    changed_paths: &mut BTreeSet<String>,
) -> SyncResult<()> {
    let bytes = client
        .get_file(&remote.file_url)
        .map_err(|error| format!("{error}，路径 {relative_path}"))?;
    let target_path = project_root.join(Path::new(relative_path));

    if let Some(parent) = target_path.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("创建本地目录失败：{error}"))?;
    }

    fs::write(&target_path, bytes).map_err(|error| format!("写入本地文件失败：{error}"))?;
    changed_paths.insert(relative_path.to_string());
    Ok(())
}

fn create_local_directory(project_root: &Path, relative_path: &str) -> SyncResult<()> {
    fs::create_dir_all(project_root.join(Path::new(relative_path)))
        .map_err(|error| format!("创建本地目录失败：{error}"))
}

fn join_relative_path(project_url: &Url, relative_path: &str) -> SyncResult<Url> {
    let mut url = project_url.clone();
    let mut path_segments = url
        .path_segments_mut()
        .map_err(|_| "WebDAV 地址不支持路径拼接".to_string())?;

    for segment in relative_path
        .split('/')
        .filter(|segment| !segment.is_empty())
    {
        if segment == "." || segment == ".." {
            return Err("同步路径不合法".to_string());
        }
        path_segments.push(segment);
    }

    drop(path_segments);
    Ok(url)
}

fn relative_path_from_root(root: &Path, path: &Path) -> SyncResult<String> {
    let relative = path
        .strip_prefix(root)
        .map_err(|_| "文件路径超出项目目录".to_string())?;

    Ok(relative.to_string_lossy().replace('\\', "/"))
}

fn parent_directory(path: &str) -> Option<String> {
    path.rsplit_once('/').map(|(parent, _)| parent.to_string())
}

fn fetch_remote_file_hash(
    client: &WebDavClient,
    remote: &RemoteFileEntry,
    relative_path: &str,
    cache: &mut BTreeMap<String, String>,
) -> SyncResult<String> {
    if let Some(hash) = cache.get(relative_path) {
        return Ok(hash.clone());
    }

    let hash = hash_bytes(
        &client
            .get_file(&remote.file_url)
            .map_err(|error| format!("{error}，路径 {relative_path}"))?,
    );
    cache.insert(relative_path.to_string(), hash.clone());
    Ok(hash)
}

fn find_child_text(node: roxmltree::Node<'_, '_>, child_name: &str) -> Option<String> {
    node.children()
        .find(|child| child.is_element() && child.tag_name().name() == child_name)
        .and_then(|child| child.text())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn find_descendant_text<'a, 'input>(
    node: roxmltree::Node<'a, 'input>,
    descendant_name: &str,
) -> Option<String> {
    node.descendants()
        .find(|child| child.is_element() && child.tag_name().name() == descendant_name)
        .and_then(|child| child.text())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
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

fn hash_bytes(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    format!("{digest:x}")
}

fn current_timestamp_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock should be after unix epoch")
        .as_millis() as u64
}

impl RemoteRevision {
    fn matches(&self, other: &RemoteRevision) -> bool {
        if let (Some(left), Some(right)) = (&self.etag, &other.etag) {
            return left == right;
        }

        if let (Some(left), Some(right)) = (&self.last_modified, &other.last_modified) {
            return left == right && self.size == other.size;
        }

        if self.size.is_some() && other.size.is_some() {
            return self.size == other.size;
        }

        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct TempDir {
        path: PathBuf,
    }

    impl TempDir {
        fn new(prefix: &str) -> Self {
            let unique = current_timestamp_millis();
            let path = std::env::temp_dir().join(format!("{prefix}_{unique}"));
            fs::create_dir_all(&path).unwrap();
            Self { path }
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    #[test]
    fn sync_settings_roundtrip_uses_json_file() {
        let dir = TempDir::new("moss_writer_sync_settings");

        let saved = save_sync_settings_to_dir(
            &dir.path,
            SyncSettings {
                enabled: true,
                root_url: "https://dav.example.com/writer/".to_string(),
                username: "writer".to_string(),
                password: "secret".to_string(),
                auto_pull_on_open: true,
                auto_push_on_save: true,
                auto_push_min_interval_seconds: 90,
            },
        )
        .unwrap();

        let loaded = load_sync_settings_from_dir(&dir.path).unwrap();

        assert_eq!(saved, loaded);
        assert_eq!(loaded.root_url, "https://dav.example.com/writer");
    }

    #[test]
    fn build_project_remote_url_appends_mosswriter_and_project_name() {
        let url = build_project_remote_url(
            &Url::parse("https://dav.example.com/root").unwrap(),
            Path::new("D:/novels/project-a"),
        )
        .unwrap();

        assert_eq!(
            url.as_str(),
            "https://dav.example.com/root/MossWriter/project-a"
        );
    }

    #[test]
    fn resolve_webdav_href_uses_project_collection_for_relative_paths() {
        let project_url = Url::parse("https://dav.example.com/root/MossWriter/project-a").unwrap();

        let resolved = resolve_webdav_href(&project_url, "chapter.md").unwrap();

        assert_eq!(
            resolved.as_str(),
            "https://dav.example.com/root/MossWriter/project-a/chapter.md"
        );
    }

    #[test]
    fn parse_remote_tree_response_decodes_encoded_segments_without_reencoding_file_url() {
        let project_url = Url::parse("https://dav.example.com/root/MossWriter/project-a").unwrap();
        let body = r#"<?xml version="1.0" encoding="utf-8"?>
<multistatus xmlns="DAV:">
  <response>
    <href>/root/MossWriter/project-a/</href>
    <propstat>
      <prop>
        <resourcetype><collection /></resourcetype>
      </prop>
    </propstat>
  </response>
  <response>
    <href>%E4%B8%AD%20%E6%96%87.md</href>
    <propstat>
      <prop>
        <getetag>"etag-1"</getetag>
        <getcontentlength>12</getcontentlength>
      </prop>
    </propstat>
  </response>
</multistatus>"#;

        let snapshot = parse_remote_tree_response(body, &project_url).unwrap();
        let entry = snapshot.files.get("中 文.md").unwrap();

        assert_eq!(
            entry.file_url.as_str(),
            "https://dav.example.com/root/MossWriter/project-a/%E4%B8%AD%20%E6%96%87.md"
        );
        assert_eq!(entry.revision.etag.as_deref(), Some("\"etag-1\""));
        assert_eq!(entry.revision.size, Some(12));
    }

    #[test]
    fn parse_remote_tree_response_matches_encoded_project_name_prefix() {
        let project_url = Url::parse(
            "https://dav.example.com/root/MossWriter/%E4%B8%AD%E6%96%87%E9%A1%B9%E7%9B%AE",
        )
        .unwrap();
        let body = r#"<?xml version="1.0" encoding="utf-8"?>
<multistatus xmlns="DAV:">
  <response>
    <href>/root/MossWriter/%E4%B8%AD%E6%96%87%E9%A1%B9%E7%9B%AE/%E7%AC%AC%201%20%E7%AB%A0.md</href>
    <propstat>
      <prop>
        <getetag>"etag-cn"</getetag>
      </prop>
    </propstat>
  </response>
</multistatus>"#;

        let snapshot = parse_remote_tree_response(body, &project_url).unwrap();

        assert!(snapshot.files.contains_key("第 1 章.md"));
    }

    #[test]
    fn classify_remote_tree_lookup_treats_404_and_409_as_missing() {
        assert_eq!(
            classify_remote_tree_lookup(StatusCode::NOT_FOUND).unwrap(),
            RemoteTreeLookup::Missing
        );
        assert_eq!(
            classify_remote_tree_lookup(StatusCode::CONFLICT).unwrap(),
            RemoteTreeLookup::Missing
        );
    }

    #[test]
    fn classify_remote_tree_lookup_rejects_unexpected_error_statuses() {
        assert_eq!(
            classify_remote_tree_lookup(StatusCode::FORBIDDEN).unwrap_err(),
            "读取 WebDAV 目录失败：HTTP 403"
        );
        assert_eq!(
            classify_remote_tree_lookup(StatusCode::INTERNAL_SERVER_ERROR).unwrap_err(),
            "读取 WebDAV 目录失败：HTTP 500"
        );
    }

    #[test]
    fn scan_local_snapshot_excludes_git_directory_and_keeps_other_files() {
        let dir = TempDir::new("moss_writer_sync_scan");
        fs::create_dir_all(dir.path.join(".git/hooks")).unwrap();
        fs::create_dir_all(dir.path.join("assets")).unwrap();
        fs::write(dir.path.join(".git/config"), "[core]").unwrap();
        fs::write(dir.path.join("draft.md"), "chapter").unwrap();
        fs::write(dir.path.join("assets/cover.png"), [1_u8, 2, 3]).unwrap();

        let snapshot = scan_local_snapshot(&dir.path).unwrap();

        assert!(snapshot.files.contains_key("draft.md"));
        assert!(snapshot.files.contains_key("assets/cover.png"));
        assert!(!snapshot.files.contains_key(".git/config"));
        assert!(snapshot.directories.contains("assets"));
        assert!(!snapshot.directories.contains(".git"));
    }

    #[test]
    fn remote_revision_prefers_etag_then_modified_and_size() {
        let baseline = RemoteRevision {
            etag: Some("\"abc\"".to_string()),
            last_modified: Some("Mon, 01 Jan 2024 00:00:00 GMT".to_string()),
            size: Some(12),
        };
        let same = RemoteRevision {
            etag: Some("\"abc\"".to_string()),
            last_modified: Some("Tue, 02 Jan 2024 00:00:00 GMT".to_string()),
            size: Some(90),
        };
        let changed = RemoteRevision {
            etag: Some("\"def\"".to_string()),
            last_modified: Some("Mon, 01 Jan 2024 00:00:00 GMT".to_string()),
            size: Some(12),
        };

        assert!(baseline.matches(&same));
        assert!(!baseline.matches(&changed));
    }
}
