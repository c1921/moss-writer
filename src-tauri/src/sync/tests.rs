use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::{Path, PathBuf},
};

use reqwest::{StatusCode, Url};

use super::{
    planner::{
        build_resolve_plan, collect_pending_state_with_resolver, path_has_deleted_ancestor,
        sorted_paths,
    },
    remote::{
        build_project_remote_url, classify_remote_tree_lookup, collect_remote_tree_with_fetcher,
        parse_remote_tree_response, resolve_webdav_href, RemoteTreeLookup,
    },
    storage::{
        current_timestamp_millis, load_sync_settings_from_dir, save_sync_settings_to_dir,
        scan_local_snapshot,
    },
    types::{
        BaselineFileEntry, LocalFileEntry, LocalSnapshot, RemoteFileEntry, RemoteRevision,
        RemoteSnapshot, SyncBaseline,
    },
    SyncLatestResolution, SyncLatestResolutionReason, SyncPendingEntryType, SyncPendingItem,
    SyncPendingReason, SyncResolveStrategy, SyncSettings,
};

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
    let project_url =
        Url::parse("https://dav.example.com/root/MossWriter/%E4%B8%AD%E6%96%87%E9%A1%B9%E7%9B%AE")
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
fn collect_remote_tree_with_fetcher_recursively_discovers_nested_entries() {
    let project_url = Url::parse("https://dav.example.com/root/MossWriter/project-a").unwrap();
    let mut calls = BTreeMap::new();

    let snapshot = collect_remote_tree_with_fetcher(&project_url, |url| {
        *calls.entry(url.as_str().to_string()).or_insert(0) += 1;

        let body = match url.as_str() {
            "https://dav.example.com/root/MossWriter/project-a" => Some(
                r#"<?xml version="1.0" encoding="utf-8"?>
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
    <href>/root/MossWriter/project-a/assets/</href>
    <propstat>
      <prop>
        <resourcetype><collection /></resourcetype>
      </prop>
    </propstat>
  </response>
</multistatus>"#,
            ),
            "https://dav.example.com/root/MossWriter/project-a/assets" => Some(
                r#"<?xml version="1.0" encoding="utf-8"?>
<multistatus xmlns="DAV:">
  <response>
    <href>/root/MossWriter/project-a/assets/</href>
    <propstat>
      <prop>
        <resourcetype><collection /></resourcetype>
      </prop>
    </propstat>
  </response>
  <response>
    <href>/root/MossWriter/project-a/assets/scenes/</href>
    <propstat>
      <prop>
        <resourcetype><collection /></resourcetype>
      </prop>
    </propstat>
  </response>
</multistatus>"#,
            ),
            "https://dav.example.com/root/MossWriter/project-a/assets/scenes" => Some(
                r#"<?xml version="1.0" encoding="utf-8"?>
<multistatus xmlns="DAV:">
  <response>
    <href>/root/MossWriter/project-a/assets/scenes/</href>
    <propstat>
      <prop>
        <resourcetype><collection /></resourcetype>
      </prop>
    </propstat>
  </response>
  <response>
    <href>chapter%201.md</href>
    <propstat>
      <prop>
        <getetag>"etag-nested"</getetag>
        <getcontentlength>128</getcontentlength>
      </prop>
    </propstat>
  </response>
</multistatus>"#,
            ),
            _ => None,
        };

        Ok(body.map(str::to_string))
    })
    .unwrap();

    assert!(snapshot.root_exists);
    assert!(snapshot.directories.contains("assets"));
    assert!(snapshot.directories.contains("assets/scenes"));
    assert!(snapshot.files.contains_key("assets/scenes/chapter 1.md"));
    assert_eq!(
        snapshot
            .files
            .get("assets/scenes/chapter 1.md")
            .unwrap()
            .file_url
            .as_str(),
        "https://dav.example.com/root/MossWriter/project-a/assets/scenes/chapter%201.md"
    );
    assert_eq!(
        calls.get("https://dav.example.com/root/MossWriter/project-a"),
        Some(&1)
    );
    assert_eq!(
        calls.get("https://dav.example.com/root/MossWriter/project-a/assets"),
        Some(&1)
    );
    assert_eq!(
        calls.get("https://dav.example.com/root/MossWriter/project-a/assets/scenes"),
        Some(&1)
    );
}

#[test]
fn collect_remote_tree_with_fetcher_ignores_missing_nested_listing_after_discovery() {
    let project_url = Url::parse("https://dav.example.com/root/MossWriter/project-a").unwrap();

    let snapshot = collect_remote_tree_with_fetcher(&project_url, |url| {
        let body = match url.as_str() {
            "https://dav.example.com/root/MossWriter/project-a" => Some(
                r#"<?xml version="1.0" encoding="utf-8"?>
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
    <href>/root/MossWriter/project-a/assets/</href>
    <propstat>
      <prop>
        <resourcetype><collection /></resourcetype>
      </prop>
    </propstat>
  </response>
</multistatus>"#,
            ),
            _ => None,
        };

        Ok(body.map(str::to_string))
    })
    .unwrap();

    assert!(snapshot.root_exists);
    assert!(snapshot.directories.contains("assets"));
    assert!(snapshot.files.is_empty());
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

fn remote_file_entry(path: &str, revision: RemoteRevision) -> RemoteFileEntry {
    RemoteFileEntry {
        file_url: Url::parse(&format!(
            "https://dav.example.com/root/MossWriter/project-a/{path}"
        ))
        .unwrap(),
        revision,
    }
}

#[test]
fn collect_pending_state_detects_initial_content_mismatch_and_prefers_newer_remote() {
    let mut local_snapshot = LocalSnapshot::default();
    local_snapshot.files.insert(
        "draft.md".to_string(),
        LocalFileEntry {
            content_hash: "local".to_string(),
            modified_at: Some(1_000),
        },
    );

    let mut remote_snapshot = RemoteSnapshot {
        root_exists: true,
        ..RemoteSnapshot::default()
    };
    remote_snapshot.files.insert(
        "draft.md".to_string(),
        remote_file_entry(
            "draft.md",
            RemoteRevision {
                etag: Some("\"draft-remote\"".to_string()),
                last_modified: Some("Thu, 01 Jan 1970 00:00:02 GMT".to_string()),
                size: Some(5),
            },
        ),
    );

    let state = collect_pending_state_with_resolver(
        &SyncBaseline::default(),
        &local_snapshot,
        &remote_snapshot,
        |_path, _remote| Ok("remote".to_string()),
    )
    .unwrap();

    assert_eq!(state.items.len(), 1);
    assert_eq!(
        state.items[0].reason,
        SyncPendingReason::InitialContentMismatch
    );
    assert_eq!(
        state.items[0].latest_resolution,
        SyncLatestResolution::Remote
    );
    assert_eq!(
        state.items[0].latest_resolution_reason,
        SyncLatestResolutionReason::RemoteNewer
    );
}

#[test]
fn collect_pending_state_marks_local_ahead_and_local_deletion_only() {
    let mut baseline = SyncBaseline::default();
    baseline.files.insert(
        "chapter.md".to_string(),
        BaselineFileEntry {
            content_hash: "base".to_string(),
            remote_revision: RemoteRevision {
                etag: Some("\"chapter-base\"".to_string()),
                last_modified: Some("Thu, 01 Jan 1970 00:00:01 GMT".to_string()),
                size: Some(4),
            },
        },
    );
    baseline.files.insert(
        "old.md".to_string(),
        BaselineFileEntry {
            content_hash: "old".to_string(),
            remote_revision: RemoteRevision {
                etag: Some("\"old-base\"".to_string()),
                last_modified: Some("Thu, 01 Jan 1970 00:00:01 GMT".to_string()),
                size: Some(3),
            },
        },
    );

    let mut local_snapshot = LocalSnapshot::default();
    local_snapshot.files.insert(
        "chapter.md".to_string(),
        LocalFileEntry {
            content_hash: "local".to_string(),
            modified_at: Some(5_000),
        },
    );

    let mut remote_snapshot = RemoteSnapshot {
        root_exists: true,
        ..RemoteSnapshot::default()
    };
    remote_snapshot.files.insert(
        "chapter.md".to_string(),
        remote_file_entry(
            "chapter.md",
            RemoteRevision {
                etag: Some("\"chapter-base\"".to_string()),
                last_modified: Some("Thu, 01 Jan 1970 00:00:01 GMT".to_string()),
                size: Some(4),
            },
        ),
    );
    remote_snapshot.files.insert(
        "old.md".to_string(),
        remote_file_entry(
            "old.md",
            RemoteRevision {
                etag: Some("\"old-base\"".to_string()),
                last_modified: Some("Thu, 01 Jan 1970 00:00:01 GMT".to_string()),
                size: Some(3),
            },
        ),
    );

    let state = collect_pending_state_with_resolver(
        &baseline,
        &local_snapshot,
        &remote_snapshot,
        |_path, _remote| unreachable!("hash resolver should not be used"),
    )
    .unwrap();

    assert_eq!(state.items.len(), 2);
    assert_eq!(state.items[0].path, "chapter.md");
    assert_eq!(state.items[0].reason, SyncPendingReason::LocalAhead);
    assert_eq!(
        state.items[0].latest_resolution,
        SyncLatestResolution::Local
    );
    assert_eq!(
        state.items[0].latest_resolution_reason,
        SyncLatestResolutionReason::LocalAhead
    );

    assert_eq!(state.items[1].path, "old.md");
    assert_eq!(
        state.items[1].reason,
        SyncPendingReason::LocalDeletedRemotePresent
    );
    assert_eq!(
        state.items[1].latest_resolution,
        SyncLatestResolution::Local
    );
    assert_eq!(
        state.items[1].latest_resolution_reason,
        SyncLatestResolutionReason::LocalDeletionOnly
    );
}

#[test]
fn collect_pending_state_marks_delete_conflict_as_undetermined() {
    let mut baseline = SyncBaseline::default();
    baseline.files.insert(
        "draft.md".to_string(),
        BaselineFileEntry {
            content_hash: "base".to_string(),
            remote_revision: RemoteRevision {
                etag: Some("\"draft-base\"".to_string()),
                last_modified: Some("Thu, 01 Jan 1970 00:00:01 GMT".to_string()),
                size: Some(4),
            },
        },
    );

    let mut local_snapshot = LocalSnapshot::default();
    local_snapshot.files.insert(
        "draft.md".to_string(),
        LocalFileEntry {
            content_hash: "local-new".to_string(),
            modified_at: Some(5_000),
        },
    );

    let state = collect_pending_state_with_resolver(
        &baseline,
        &local_snapshot,
        &RemoteSnapshot::default(),
        |_path, _remote| unreachable!("hash resolver should not be used"),
    )
    .unwrap();

    assert_eq!(state.items.len(), 1);
    assert_eq!(
        state.items[0].reason,
        SyncPendingReason::RemoteDeletedLocalPresent
    );
    assert_eq!(
        state.items[0].latest_resolution,
        SyncLatestResolution::Undetermined
    );
    assert_eq!(
        state.items[0].latest_resolution_reason,
        SyncLatestResolutionReason::DeletionConflict
    );
}

#[test]
fn build_resolve_plan_maps_actions_and_skips_undetermined_latest_items() {
    let pending_items = vec![
        SyncPendingItem {
            path: "draft.md".to_string(),
            entry_type: SyncPendingEntryType::File,
            reason: SyncPendingReason::BothModified,
            local_exists: true,
            remote_exists: true,
            local_modified_at: Some(2),
            remote_modified_at: Some(1),
            latest_resolution: SyncLatestResolution::Local,
            latest_resolution_reason: SyncLatestResolutionReason::LocalNewer,
        },
        SyncPendingItem {
            path: "trash.md".to_string(),
            entry_type: SyncPendingEntryType::File,
            reason: SyncPendingReason::LocalDeletedRemotePresent,
            local_exists: false,
            remote_exists: true,
            local_modified_at: None,
            remote_modified_at: Some(1),
            latest_resolution: SyncLatestResolution::Local,
            latest_resolution_reason: SyncLatestResolutionReason::LocalDeletionOnly,
        },
        SyncPendingItem {
            path: "assets".to_string(),
            entry_type: SyncPendingEntryType::Directory,
            reason: SyncPendingReason::RemoteOnly,
            local_exists: false,
            remote_exists: true,
            local_modified_at: None,
            remote_modified_at: None,
            latest_resolution: SyncLatestResolution::Remote,
            latest_resolution_reason: SyncLatestResolutionReason::RemoteOnly,
        },
        SyncPendingItem {
            path: "conflict.md".to_string(),
            entry_type: SyncPendingEntryType::File,
            reason: SyncPendingReason::BothModified,
            local_exists: true,
            remote_exists: true,
            local_modified_at: Some(1),
            remote_modified_at: Some(1),
            latest_resolution: SyncLatestResolution::Undetermined,
            latest_resolution_reason: SyncLatestResolutionReason::TimestampsEqual,
        },
    ];

    let plan = build_resolve_plan(SyncResolveStrategy::Latest, &pending_items);

    assert!(plan.upload_files.contains("draft.md"));
    assert!(plan.delete_remote_files.contains("trash.md"));
    assert!(plan.create_local_directories.contains("assets"));
    assert!(!plan.resolved_file_paths.contains("conflict.md"));
    assert_eq!(plan.applied_item_count, 3);
}

#[test]
fn sorted_paths_prefers_depth_and_deleted_ancestor_short_circuits_nested_paths() {
    let mut paths = BTreeSet::new();
    paths.insert("chapter".to_string());
    paths.insert("chapter/part-1".to_string());
    paths.insert("chapter/part-1/scene.md".to_string());
    paths.insert("appendix".to_string());

    assert_eq!(
        sorted_paths(&paths, false),
        vec![
            "appendix".to_string(),
            "chapter".to_string(),
            "chapter/part-1".to_string(),
            "chapter/part-1/scene.md".to_string(),
        ]
    );
    assert_eq!(
        sorted_paths(&paths, true),
        vec![
            "chapter/part-1/scene.md".to_string(),
            "chapter/part-1".to_string(),
            "chapter".to_string(),
            "appendix".to_string(),
        ]
    );

    let mut deleted_directories = BTreeSet::new();
    deleted_directories.insert("chapter".to_string());

    assert!(path_has_deleted_ancestor(
        "chapter/part-1",
        &deleted_directories
    ));
    assert!(!path_has_deleted_ancestor("chapter", &deleted_directories));
}
