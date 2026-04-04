use std::{
    fs,
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};

use serde::Serialize;
use tauri::State;

use crate::state::ProjectState;

type AppResult<T> = Result<T, String>;

const INVALID_PATH_NAME_CHARS: [char; 9] = ['<', '>', ':', '"', '/', '\\', '|', '?', '*'];

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub updated_at: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSnapshot {
    pub project_path: String,
    pub files: Vec<FileEntry>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SyncResponse {
    pub status: String,
    pub message: String,
}

#[tauri::command]
pub fn open_project(directory: String, state: State<'_, ProjectState>) -> AppResult<ProjectSnapshot> {
    let root = canonicalize_directory(&directory)?;
    let files = list_project_files(&root)?;

    state.set_root(root.clone())?;

    Ok(ProjectSnapshot {
        project_path: root.to_string_lossy().to_string(),
        files,
    })
}

#[tauri::command]
pub fn read_file(path: String, state: State<'_, ProjectState>) -> AppResult<String> {
    let root = state.get_root()?;
    read_project_file(&root, &path)
}

#[tauri::command]
pub fn write_file(path: String, content: String, state: State<'_, ProjectState>) -> AppResult<()> {
    let root = state.get_root()?;
    write_project_file(&root, &path, &content)
}

#[tauri::command]
pub fn list_files(directory: String) -> AppResult<Vec<FileEntry>> {
    let root = canonicalize_directory(&directory)?;
    list_project_files(&root)
}

#[tauri::command]
pub fn create_file(path: String, state: State<'_, ProjectState>) -> AppResult<FileEntry> {
    let root = state.get_root()?;
    create_project_file(&root, &path)
}

#[tauri::command]
pub fn rename_file(
    path: String,
    new_name: String,
    state: State<'_, ProjectState>,
) -> AppResult<FileEntry> {
    let root = state.get_root()?;
    rename_project_file(&root, &path, &new_name)
}

#[tauri::command]
pub fn delete_file(path: String, state: State<'_, ProjectState>) -> AppResult<()> {
    let root = state.get_root()?;
    delete_project_file(&root, &path)
}

#[tauri::command]
pub fn sync_push() -> SyncResponse {
    SyncResponse {
        status: "unsupported".to_string(),
        message: "同步推送尚未实现，当前版本仅保留扩展接口".to_string(),
    }
}

#[tauri::command]
pub fn sync_pull() -> SyncResponse {
    SyncResponse {
        status: "unsupported".to_string(),
        message: "同步拉取尚未实现，当前版本仅保留扩展接口".to_string(),
    }
}

fn canonicalize_directory(directory: &str) -> AppResult<PathBuf> {
    let trimmed = directory.trim();
    if trimmed.is_empty() {
        return Err("项目目录不能为空".to_string());
    }

    let canonical =
        fs::canonicalize(trimmed).map_err(|error| format!("无法打开项目目录：{error}"))?;

    if !canonical.is_dir() {
        return Err("所选路径不是文件夹".to_string());
    }

    Ok(canonical)
}

fn canonicalize_root(root: &Path) -> AppResult<PathBuf> {
    fs::canonicalize(root).map_err(|error| format!("项目目录不可访问：{error}"))
}

fn normalize_project_file_path(input: &str, auto_append_md: bool) -> AppResult<String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err("文件路径不能为空".to_string());
    }

    if Path::new(trimmed).is_absolute() || trimmed.starts_with('/') || trimmed.starts_with('\\') {
        return Err("不允许使用绝对路径".to_string());
    }

    let normalized = trimmed.replace('\\', "/");
    let mut segments = normalized
        .split('/')
        .map(str::to_string)
        .collect::<Vec<String>>();

    if segments.is_empty() || segments.iter().any(|segment| segment.is_empty()) {
        return Err("文件路径格式不合法".to_string());
    }

    let last_index = segments.len() - 1;
    for (index, segment) in segments.iter().enumerate() {
        validate_path_segment(segment, index == last_index)?;
    }

    let last_segment = segments
        .last_mut()
        .ok_or_else(|| "文件路径格式不合法".to_string())?;

    match Path::new(last_segment)
        .extension()
        .and_then(|value| value.to_str())
    {
        Some(ext) if ext.eq_ignore_ascii_case("md") => {}
        Some(_) => return Err("只允许使用 .md 文件".to_string()),
        None if auto_append_md => last_segment.push_str(".md"),
        None => return Err("文件必须是 .md".to_string()),
    }

    let stem = Path::new(last_segment)
        .file_stem()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "文件名不合法".to_string())?;

    if stem.is_empty() {
        return Err("文件名不合法".to_string());
    }

    if is_reserved_windows_name(stem) {
        return Err("文件名与系统保留名称冲突".to_string());
    }

    Ok(segments.join("/"))
}

fn validate_path_segment(segment: &str, is_last_segment: bool) -> AppResult<()> {
    if segment == "." || segment == ".." {
        return Err("文件路径不能包含 . 或 ..".to_string());
    }

    if segment.ends_with('.') || segment.ends_with(' ') {
        return Err("路径名称不能以空格或点结尾".to_string());
    }

    if segment
        .chars()
        .any(|ch| ch.is_control() || INVALID_PATH_NAME_CHARS.contains(&ch))
    {
        return Err("路径名称包含非法字符".to_string());
    }

    let reserved_target = if is_last_segment {
        Path::new(segment)
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or(segment)
    } else {
        segment
    };

    if reserved_target.is_empty() {
        return Err("路径名称不合法".to_string());
    }

    if is_reserved_windows_name(reserved_target) {
        return Err("路径名称与系统保留名称冲突".to_string());
    }

    Ok(())
}

fn is_reserved_windows_name(stem: &str) -> bool {
    matches!(
        stem.to_ascii_uppercase().as_str(),
        "CON"
            | "PRN"
            | "AUX"
            | "NUL"
            | "COM1"
            | "COM2"
            | "COM3"
            | "COM4"
            | "COM5"
            | "COM6"
            | "COM7"
            | "COM8"
            | "COM9"
            | "LPT1"
            | "LPT2"
            | "LPT3"
            | "LPT4"
            | "LPT5"
            | "LPT6"
            | "LPT7"
            | "LPT8"
            | "LPT9"
    )
}

fn ensure_within_root(root: &Path, path: &Path) -> AppResult<()> {
    if path.starts_with(root) {
        Ok(())
    } else {
        Err("文件路径超出项目目录".to_string())
    }
}

fn is_markdown_path(path: &Path) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.eq_ignore_ascii_case("md"))
}

fn relative_project_path(root: &Path, path: &Path) -> AppResult<String> {
    let relative = path
        .strip_prefix(root)
        .map_err(|_| "文件路径超出项目目录".to_string())?;

    let normalized = relative.to_string_lossy().replace('\\', "/");
    if normalized.is_empty() {
        return Err("文件路径不合法".to_string());
    }

    Ok(normalized)
}

fn resolve_existing_project_file(root: &Path, raw_path: &str) -> AppResult<(String, PathBuf)> {
    let root = canonicalize_root(root)?;
    let normalized = normalize_project_file_path(raw_path, false)?;
    let candidate = root.join(Path::new(&normalized));
    let canonical = fs::canonicalize(&candidate)
        .map_err(|error| format!("文件不存在或不可访问：{error}"))?;

    ensure_within_root(&root, &canonical)?;

    if !canonical.is_file() {
        return Err("目标不是文件".to_string());
    }

    Ok((normalized, canonical))
}

fn resolve_new_project_file(root: &Path, raw_path: &str) -> AppResult<(String, PathBuf)> {
    let root = canonicalize_root(root)?;
    let normalized = normalize_project_file_path(raw_path, true)?;
    let candidate = root.join(Path::new(&normalized));
    let parent = candidate
        .parent()
        .ok_or_else(|| "文件路径不合法".to_string())?;

    if !parent.exists() {
        return Err("目标目录不存在".to_string());
    }

    let canonical_parent = fs::canonicalize(parent)
        .map_err(|error| format!("目标目录不可访问：{error}"))?;
    ensure_within_root(&root, &canonical_parent)?;

    if !canonical_parent.is_dir() {
        return Err("目标目录不可用".to_string());
    }

    if candidate.exists() {
        return Err("目标文件已存在".to_string());
    }

    Ok((normalized, candidate))
}

fn file_entry_from_path(root: &Path, path: &Path) -> AppResult<FileEntry> {
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "无法解析文件名".to_string())?
        .to_string();

    let updated_at = path
        .metadata()
        .ok()
        .and_then(|metadata| metadata.modified().ok())
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_secs());

    Ok(FileEntry {
        name,
        path: relative_project_path(root, path)?,
        updated_at,
    })
}

fn collect_project_files(root: &Path, directory: &Path, files: &mut Vec<FileEntry>) -> AppResult<()> {
    let mut entries = fs::read_dir(directory)
        .map_err(|error| format!("无法读取项目目录：{error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("无法读取目录内容：{error}"))?;

    entries.sort_by_key(|entry| entry.file_name().to_string_lossy().to_ascii_lowercase());

    for entry in entries {
        let path = entry.path();
        let file_type = entry
            .file_type()
            .map_err(|error| format!("无法读取目录内容：{error}"))?;

        if file_type.is_dir() {
            let canonical = fs::canonicalize(&path)
                .map_err(|error| format!("无法读取目录内容：{error}"))?;
            if canonical.starts_with(root) {
                collect_project_files(root, &path, files)?;
            }
            continue;
        }

        if !file_type.is_file() || !is_markdown_path(&path) {
            continue;
        }

        let canonical = fs::canonicalize(&path)
            .map_err(|error| format!("无法读取目录内容：{error}"))?;
        if canonical.starts_with(root) {
            files.push(file_entry_from_path(root, &path)?);
        }
    }

    Ok(())
}

pub fn list_project_files(root: &Path) -> AppResult<Vec<FileEntry>> {
    let root = canonicalize_root(root)?;
    let mut files = Vec::new();

    collect_project_files(&root, &root, &mut files)?;
    files.sort_by_key(|entry| entry.path.to_ascii_lowercase());

    Ok(files)
}

pub fn read_project_file(root: &Path, raw_path: &str) -> AppResult<String> {
    let (_, file_path) = resolve_existing_project_file(root, raw_path)?;

    fs::read_to_string(file_path).map_err(|error| format!("读取文件失败：{error}"))
}

pub fn write_project_file(root: &Path, raw_path: &str, content: &str) -> AppResult<()> {
    let (_, file_path) = resolve_existing_project_file(root, raw_path)?;

    fs::write(file_path, content).map_err(|error| format!("写入文件失败：{error}"))
}

pub fn create_project_file(root: &Path, raw_path: &str) -> AppResult<FileEntry> {
    let (_, file_path) = resolve_new_project_file(root, raw_path)?;
    fs::write(&file_path, "").map_err(|error| format!("创建文件失败：{error}"))?;
    let root = canonicalize_root(root)?;
    file_entry_from_path(&root, &file_path)
}

pub fn rename_project_file(root: &Path, raw_path: &str, new_name: &str) -> AppResult<FileEntry> {
    let (_, source_path) = resolve_existing_project_file(root, raw_path)?;
    let (_, target_path) = resolve_new_project_file(root, new_name)?;

    fs::rename(&source_path, &target_path).map_err(|error| format!("重命名失败：{error}"))?;
    let root = canonicalize_root(root)?;
    file_entry_from_path(&root, &target_path)
}

pub fn delete_project_file(root: &Path, raw_path: &str) -> AppResult<()> {
    let (_, file_path) = resolve_existing_project_file(root, raw_path)?;
    fs::remove_file(file_path).map_err(|error| format!("删除文件失败：{error}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    struct TestProject {
        root: PathBuf,
    }

    impl TestProject {
        fn new() -> Self {
            let unique = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("time should be monotonic")
                .as_nanos();

            let root = std::env::temp_dir().join(format!("moss_writer_test_{unique}"));
            fs::create_dir_all(&root).expect("temporary project directory should be created");

            Self { root }
        }

        fn path(&self) -> &Path {
            &self.root
        }
    }

    impl Drop for TestProject {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    #[test]
    fn list_project_files_recursively_returns_markdown_files() {
        let project = TestProject::new();
        fs::create_dir_all(project.path().join("drafts/part-1")).unwrap();
        fs::write(project.path().join("chapter-1.md"), "content").unwrap();
        fs::write(project.path().join("drafts/part-1/chapter-2.md"), "nested").unwrap();
        fs::write(project.path().join("drafts/part-1/notes.txt"), "ignored").unwrap();

        let files = list_project_files(project.path()).unwrap();
        let paths = files.into_iter().map(|file| file.path).collect::<Vec<_>>();

        assert_eq!(paths.len(), 2);
        assert!(paths.contains(&"chapter-1.md".to_string()));
        assert!(paths.contains(&"drafts/part-1/chapter-2.md".to_string()));
    }

    #[test]
    fn create_project_file_requires_existing_parent_dir() {
        let project = TestProject::new();

        let error = create_project_file(project.path(), "drafts/chapter-1").unwrap_err();

        assert!(error.contains("目标目录不存在"));
    }

    #[test]
    fn read_project_file_rejects_path_traversal() {
        let project = TestProject::new();
        let error = read_project_file(project.path(), "../secret.md").unwrap_err();

        assert!(error.contains(". 或 .."));
    }

    #[test]
    fn nested_project_file_operations_succeed() {
        let project = TestProject::new();
        fs::create_dir_all(project.path().join("drafts")).unwrap();
        fs::create_dir_all(project.path().join("published")).unwrap();

        let created = create_project_file(project.path(), "drafts/chapter-1").unwrap();
        assert_eq!(created.path, "drafts/chapter-1.md");

        write_project_file(project.path(), "drafts/chapter-1.md", "hello").unwrap();
        assert_eq!(
            read_project_file(project.path(), "drafts/chapter-1.md").unwrap(),
            "hello"
        );

        let renamed = rename_project_file(
            project.path(),
            "drafts/chapter-1.md",
            "published/chapter-1-final",
        )
        .unwrap();
        assert_eq!(renamed.path, "published/chapter-1-final.md");
        assert!(project.path().join("published/chapter-1-final.md").exists());

        delete_project_file(project.path(), "published/chapter-1-final.md").unwrap();
        assert!(!project.path().join("published/chapter-1-final.md").exists());
    }
}
