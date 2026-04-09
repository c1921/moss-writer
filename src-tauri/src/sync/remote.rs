use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::Path,
};

use percent_encoding::percent_decode_str;
use reqwest::{
    blocking::Client,
    header::{HeaderMap, HeaderValue, CONTENT_TYPE},
    Method, StatusCode, Url,
};
use roxmltree::Document;

use super::{
    storage::hash_bytes,
    types::{RemoteFileEntry, RemoteRevision, RemoteSnapshot, SyncPendingEntryType, SyncSettings},
    SyncResult,
};

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

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum RemoteTreeLookup {
    Found,
    Missing,
}

pub(crate) struct WebDavClient {
    root_url: Url,
    username: String,
    password: String,
    client: Client,
}

impl WebDavClient {
    pub(crate) fn new(settings: &SyncSettings) -> SyncResult<Self> {
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

    pub(crate) fn root_url(&self) -> &Url {
        &self.root_url
    }

    pub(crate) fn test_connection(&self) -> SyncResult<()> {
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

    pub(crate) fn list_tree(&self, project_url: &Url) -> SyncResult<RemoteSnapshot> {
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

    pub(crate) fn get_file(&self, file_url: &Url) -> SyncResult<Vec<u8>> {
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

    pub(crate) fn put_file(&self, file_url: &Url, bytes: Vec<u8>) -> SyncResult<()> {
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

    pub(crate) fn mkcol(&self, directory_url: &Url) -> SyncResult<()> {
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

    pub(crate) fn delete_resource(
        &self,
        url: &Url,
        entry_type: SyncPendingEntryType,
    ) -> SyncResult<()> {
        let response = self
            .request(Method::DELETE, url.clone())
            .send()
            .map_err(|error| {
                let target = match entry_type {
                    SyncPendingEntryType::File => "删除远端文件",
                    SyncPendingEntryType::Directory => "删除远端目录",
                };
                format!("{target}失败：{error}")
            })?;

        match response.status() {
            StatusCode::OK
            | StatusCode::ACCEPTED
            | StatusCode::NO_CONTENT
            | StatusCode::NOT_FOUND => Ok(()),
            status if status.as_u16() == 207 => Ok(()),
            status => {
                let target = match entry_type {
                    SyncPendingEntryType::File => "删除远端文件",
                    SyncPendingEntryType::Directory => "删除远端目录",
                };
                Err(format!("{target}失败：HTTP {}", status.as_u16()))
            }
        }
    }

    fn request(&self, method: Method, url: Url) -> reqwest::blocking::RequestBuilder {
        self.client
            .request(method, url)
            .basic_auth(&self.username, Some(&self.password))
    }
}

pub(crate) fn sanitize_sync_settings(
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

pub(crate) fn parse_root_url(root_url: &str) -> SyncResult<Url> {
    let parsed = Url::parse(root_url).map_err(|error| format!("WebDAV 地址格式不正确：{error}"))?;

    match parsed.scheme() {
        "http" | "https" => Ok(parsed),
        _ => Err("WebDAV 地址必须使用 http 或 https".to_string()),
    }
}

pub(crate) fn normalize_root_url(url: &Url) -> String {
    let value = url.as_str().trim_end_matches('/');
    if value.is_empty() {
        url.as_str().to_string()
    } else {
        value.to_string()
    }
}

pub(crate) fn classify_remote_tree_lookup(status: StatusCode) -> SyncResult<RemoteTreeLookup> {
    match status {
        status if status.as_u16() == 207 || status == StatusCode::OK => Ok(RemoteTreeLookup::Found),
        StatusCode::NOT_FOUND | StatusCode::CONFLICT => Ok(RemoteTreeLookup::Missing),
        status => Err(format!("读取 WebDAV 目录失败：HTTP {}", status.as_u16())),
    }
}

pub(crate) fn build_project_remote_url(base_root: &Url, project_root: &Path) -> SyncResult<Url> {
    let project_name = project_root
        .file_name()
        .and_then(|value| value.to_str())
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "无法解析项目名称".to_string())?;

    join_url(base_root, &[APP_REMOTE_ROOT_SEGMENT, project_name])
}

pub(crate) fn resolve_webdav_href(project_url: &Url, href: &str) -> SyncResult<Url> {
    let trimmed = href.trim();
    if trimmed.is_empty() {
        return Err("WebDAV 返回了空路径".to_string());
    }

    collection_base_url(project_url)?
        .join(trimmed)
        .map_err(|error| format!("WebDAV 返回了无法识别的路径：{error}"))
}

pub(crate) fn parse_remote_tree_response(
    body: &str,
    project_url: &Url,
) -> SyncResult<RemoteSnapshot> {
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

pub(crate) fn ensure_remote_project_root(
    client: &WebDavClient,
    project_root: &Path,
) -> SyncResult<()> {
    let project_name = project_root
        .file_name()
        .and_then(|value| value.to_str())
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "无法解析项目名称".to_string())?;

    let app_root_url = join_url(client.root_url(), &[APP_REMOTE_ROOT_SEGMENT])?;
    client.mkcol(&app_root_url)?;

    let project_url = join_url(client.root_url(), &[APP_REMOTE_ROOT_SEGMENT, project_name])?;
    client.mkcol(&project_url)
}

pub(crate) fn ensure_remote_directory(
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

pub(crate) fn upload_local_file(
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

pub(crate) fn download_remote_file(
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

pub(crate) fn delete_remote_file(
    client: &WebDavClient,
    remote_snapshot: &RemoteSnapshot,
    path: &str,
) -> SyncResult<()> {
    if let Some(remote) = remote_snapshot.files.get(path) {
        client.delete_resource(&remote.file_url, SyncPendingEntryType::File)?;
    }

    Ok(())
}

pub(crate) fn delete_remote_directory(
    client: &WebDavClient,
    project_url: &Url,
    path: &str,
) -> SyncResult<()> {
    client.delete_resource(
        &join_relative_path(project_url, path)?,
        SyncPendingEntryType::Directory,
    )
}

pub(crate) fn join_relative_path(project_url: &Url, relative_path: &str) -> SyncResult<Url> {
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

pub(crate) fn fetch_remote_file_hash(
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

fn propfind_method() -> Method {
    Method::from_bytes(b"PROPFIND").expect("PROPFIND should be a valid HTTP method")
}

fn mkcol_method() -> Method {
    Method::from_bytes(b"MKCOL").expect("MKCOL should be a valid HTTP method")
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

fn decode_url_segment(segment: &str) -> SyncResult<String> {
    percent_decode_str(segment)
        .decode_utf8()
        .map(|value| value.into_owned())
        .map_err(|error| format!("WebDAV 返回了无法解码的路径：{error}"))
}

fn parent_directory(path: &str) -> Option<String> {
    path.rsplit_once('/').map(|(parent, _)| parent.to_string())
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
