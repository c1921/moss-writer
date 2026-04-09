use std::collections::{BTreeMap, BTreeSet};

use reqwest::Url;
use serde::{Deserialize, Serialize};

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

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SyncPendingEntryType {
    File,
    Directory,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SyncPendingReason {
    BothModified,
    InitialContentMismatch,
    LocalAhead,
    RemoteAhead,
    LocalOnly,
    RemoteOnly,
    LocalDeletedRemotePresent,
    RemoteDeletedLocalPresent,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SyncLatestResolution {
    Local,
    Remote,
    Undetermined,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SyncLatestResolutionReason {
    LocalOnly,
    RemoteOnly,
    LocalAhead,
    RemoteAhead,
    LocalNewer,
    RemoteNewer,
    LocalDeletionOnly,
    RemoteDeletionOnly,
    MissingTimestamp,
    TimestampsEqual,
    DeletionConflict,
    DirectoryDeletionConflict,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SyncPendingItem {
    pub path: String,
    pub entry_type: SyncPendingEntryType,
    pub reason: SyncPendingReason,
    pub local_exists: bool,
    pub remote_exists: bool,
    pub local_modified_at: Option<u64>,
    pub remote_modified_at: Option<u64>,
    pub latest_resolution: SyncLatestResolution,
    pub latest_resolution_reason: SyncLatestResolutionReason,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SyncResolveStrategy {
    Latest,
    Local,
    Remote,
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
    pub pending_items: Vec<SyncPendingItem>,
    pub synced_at: Option<u64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub(crate) struct SyncBaseline {
    pub(crate) files: BTreeMap<String, BaselineFileEntry>,
    pub(crate) directories: BTreeSet<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct BaselineFileEntry {
    pub(crate) content_hash: String,
    pub(crate) remote_revision: RemoteRevision,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub(crate) struct RemoteRevision {
    pub(crate) etag: Option<String>,
    pub(crate) last_modified: Option<String>,
    pub(crate) size: Option<u64>,
}

impl RemoteRevision {
    pub(crate) fn matches(&self, other: &RemoteRevision) -> bool {
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

#[derive(Debug, Clone)]
pub(crate) struct LocalFileEntry {
    pub(crate) content_hash: String,
    pub(crate) modified_at: Option<u64>,
}

#[derive(Debug, Clone, Default)]
pub(crate) struct LocalSnapshot {
    pub(crate) files: BTreeMap<String, LocalFileEntry>,
    pub(crate) directories: BTreeSet<String>,
}

#[derive(Debug, Clone)]
pub(crate) struct RemoteFileEntry {
    pub(crate) file_url: Url,
    pub(crate) revision: RemoteRevision,
}

#[derive(Debug, Clone, Default)]
pub(crate) struct RemoteSnapshot {
    pub(crate) root_exists: bool,
    pub(crate) files: BTreeMap<String, RemoteFileEntry>,
    pub(crate) directories: BTreeSet<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum SyncDirection {
    Pull,
    Push,
}

#[derive(Debug, Clone, Default)]
pub(crate) struct PendingState {
    pub(crate) items: Vec<SyncPendingItem>,
    pub(crate) conflicts: Vec<SyncConflict>,
    pub(crate) skipped_deletion_paths: Vec<String>,
}

#[derive(Debug, Clone, Default)]
pub(crate) struct ResolvePlan {
    pub(crate) upload_files: BTreeSet<String>,
    pub(crate) download_files: BTreeSet<String>,
    pub(crate) create_remote_directories: BTreeSet<String>,
    pub(crate) create_local_directories: BTreeSet<String>,
    pub(crate) delete_remote_files: BTreeSet<String>,
    pub(crate) delete_local_files: BTreeSet<String>,
    pub(crate) delete_remote_directories: BTreeSet<String>,
    pub(crate) delete_local_directories: BTreeSet<String>,
    pub(crate) resolved_file_paths: BTreeSet<String>,
    pub(crate) removed_file_paths: BTreeSet<String>,
    pub(crate) resolved_directory_paths: BTreeSet<String>,
    pub(crate) removed_directory_paths: BTreeSet<String>,
    pub(crate) applied_item_count: usize,
}

#[derive(Debug, Clone, Default)]
pub(crate) struct ResolveExecution {
    pub(crate) changed_paths: BTreeSet<String>,
    pub(crate) changed_directories: BTreeSet<String>,
    pub(crate) resolved_file_paths: BTreeSet<String>,
    pub(crate) removed_file_paths: BTreeSet<String>,
    pub(crate) resolved_directories: BTreeSet<String>,
    pub(crate) removed_directories: BTreeSet<String>,
    pub(crate) remote_mutated: bool,
}
