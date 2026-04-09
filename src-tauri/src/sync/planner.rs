use std::collections::{BTreeMap, BTreeSet};

use super::{
    remote::{fetch_remote_file_hash, WebDavClient},
    types::{
        LocalSnapshot, PendingState, RemoteFileEntry, RemoteSnapshot, ResolvePlan, SyncBaseline,
        SyncConflict, SyncDirection, SyncLatestResolution, SyncLatestResolutionReason,
        SyncPendingEntryType, SyncPendingItem, SyncPendingReason, SyncResolveStrategy,
    },
    SyncResult,
};

pub(crate) fn collect_pending_state_with_resolver<F>(
    baseline: &SyncBaseline,
    local_snapshot: &LocalSnapshot,
    remote_snapshot: &RemoteSnapshot,
    mut remote_hash_resolver: F,
) -> SyncResult<PendingState>
where
    F: FnMut(&str, &RemoteFileEntry) -> SyncResult<String>,
{
    let mut items = Vec::new();

    let file_paths = collect_union_keys(
        baseline.files.keys(),
        local_snapshot.files.keys(),
        remote_snapshot.files.keys(),
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
        let local_modified_at = local.and_then(|entry| entry.modified_at);
        let remote_modified_at = remote.and_then(|entry| remote_modified_at(&entry.revision));

        match (base, local, remote) {
            (None, None, Some(_)) => items.push(SyncPendingItem {
                path,
                entry_type: SyncPendingEntryType::File,
                reason: SyncPendingReason::RemoteOnly,
                local_exists: false,
                remote_exists: true,
                local_modified_at: None,
                remote_modified_at,
                latest_resolution: SyncLatestResolution::Remote,
                latest_resolution_reason: SyncLatestResolutionReason::RemoteOnly,
            }),
            (None, Some(_), None) => items.push(SyncPendingItem {
                path,
                entry_type: SyncPendingEntryType::File,
                reason: SyncPendingReason::LocalOnly,
                local_exists: true,
                remote_exists: false,
                local_modified_at,
                remote_modified_at: None,
                latest_resolution: SyncLatestResolution::Local,
                latest_resolution_reason: SyncLatestResolutionReason::LocalOnly,
            }),
            (None, Some(local), Some(remote)) => {
                let remote_hash = remote_hash_resolver(&path, remote)?;
                if remote_hash != local.content_hash {
                    let (latest_resolution, latest_resolution_reason) =
                        latest_resolution_from_modified_times(
                            local_modified_at,
                            remote_modified_at,
                        );
                    items.push(SyncPendingItem {
                        path,
                        entry_type: SyncPendingEntryType::File,
                        reason: SyncPendingReason::InitialContentMismatch,
                        local_exists: true,
                        remote_exists: true,
                        local_modified_at,
                        remote_modified_at,
                        latest_resolution,
                        latest_resolution_reason,
                    });
                }
            }
            (Some(_), Some(_), Some(_)) if !local_changed && !remote_changed => {}
            (Some(_), Some(_), Some(_)) if local_changed && !remote_changed => {
                items.push(SyncPendingItem {
                    path,
                    entry_type: SyncPendingEntryType::File,
                    reason: SyncPendingReason::LocalAhead,
                    local_exists: true,
                    remote_exists: true,
                    local_modified_at,
                    remote_modified_at,
                    latest_resolution: SyncLatestResolution::Local,
                    latest_resolution_reason: SyncLatestResolutionReason::LocalAhead,
                });
            }
            (Some(_), Some(_), Some(_)) if !local_changed && remote_changed => {
                items.push(SyncPendingItem {
                    path,
                    entry_type: SyncPendingEntryType::File,
                    reason: SyncPendingReason::RemoteAhead,
                    local_exists: true,
                    remote_exists: true,
                    local_modified_at,
                    remote_modified_at,
                    latest_resolution: SyncLatestResolution::Remote,
                    latest_resolution_reason: SyncLatestResolutionReason::RemoteAhead,
                });
            }
            (Some(_), Some(local), Some(remote)) => {
                let remote_hash = remote_hash_resolver(&path, remote)?;
                if remote_hash != local.content_hash {
                    let (latest_resolution, latest_resolution_reason) =
                        latest_resolution_from_modified_times(
                            local_modified_at,
                            remote_modified_at,
                        );
                    items.push(SyncPendingItem {
                        path,
                        entry_type: SyncPendingEntryType::File,
                        reason: SyncPendingReason::BothModified,
                        local_exists: true,
                        remote_exists: true,
                        local_modified_at,
                        remote_modified_at,
                        latest_resolution,
                        latest_resolution_reason,
                    });
                }
            }
            (Some(_), Some(_), None) if !local_changed => items.push(SyncPendingItem {
                path,
                entry_type: SyncPendingEntryType::File,
                reason: SyncPendingReason::RemoteDeletedLocalPresent,
                local_exists: true,
                remote_exists: false,
                local_modified_at,
                remote_modified_at: None,
                latest_resolution: SyncLatestResolution::Remote,
                latest_resolution_reason: SyncLatestResolutionReason::RemoteDeletionOnly,
            }),
            (Some(_), Some(_), None) => items.push(SyncPendingItem {
                path,
                entry_type: SyncPendingEntryType::File,
                reason: SyncPendingReason::RemoteDeletedLocalPresent,
                local_exists: true,
                remote_exists: false,
                local_modified_at,
                remote_modified_at: None,
                latest_resolution: SyncLatestResolution::Undetermined,
                latest_resolution_reason: SyncLatestResolutionReason::DeletionConflict,
            }),
            (Some(_), None, Some(_)) if !remote_changed => items.push(SyncPendingItem {
                path,
                entry_type: SyncPendingEntryType::File,
                reason: SyncPendingReason::LocalDeletedRemotePresent,
                local_exists: false,
                remote_exists: true,
                local_modified_at: None,
                remote_modified_at,
                latest_resolution: SyncLatestResolution::Local,
                latest_resolution_reason: SyncLatestResolutionReason::LocalDeletionOnly,
            }),
            (Some(_), None, Some(_)) => items.push(SyncPendingItem {
                path,
                entry_type: SyncPendingEntryType::File,
                reason: SyncPendingReason::LocalDeletedRemotePresent,
                local_exists: false,
                remote_exists: true,
                local_modified_at: None,
                remote_modified_at,
                latest_resolution: SyncLatestResolution::Undetermined,
                latest_resolution_reason: SyncLatestResolutionReason::DeletionConflict,
            }),
            (Some(_), None, None) | (None, None, None) => {}
        }
    }

    let directory_paths = collect_union_keys(
        baseline.directories.iter(),
        local_snapshot.directories.iter(),
        remote_snapshot.directories.iter(),
    );

    for path in directory_paths {
        let in_base = baseline.directories.contains(&path);
        let in_local = local_snapshot.directories.contains(&path);
        let in_remote = remote_snapshot.directories.contains(&path);

        match (in_base, in_local, in_remote) {
            (false, true, false) => items.push(SyncPendingItem {
                path,
                entry_type: SyncPendingEntryType::Directory,
                reason: SyncPendingReason::LocalOnly,
                local_exists: true,
                remote_exists: false,
                local_modified_at: None,
                remote_modified_at: None,
                latest_resolution: SyncLatestResolution::Local,
                latest_resolution_reason: SyncLatestResolutionReason::LocalOnly,
            }),
            (false, false, true) => items.push(SyncPendingItem {
                path,
                entry_type: SyncPendingEntryType::Directory,
                reason: SyncPendingReason::RemoteOnly,
                local_exists: false,
                remote_exists: true,
                local_modified_at: None,
                remote_modified_at: None,
                latest_resolution: SyncLatestResolution::Remote,
                latest_resolution_reason: SyncLatestResolutionReason::RemoteOnly,
            }),
            (true, true, false) => items.push(SyncPendingItem {
                path,
                entry_type: SyncPendingEntryType::Directory,
                reason: SyncPendingReason::RemoteDeletedLocalPresent,
                local_exists: true,
                remote_exists: false,
                local_modified_at: None,
                remote_modified_at: None,
                latest_resolution: SyncLatestResolution::Undetermined,
                latest_resolution_reason: SyncLatestResolutionReason::DirectoryDeletionConflict,
            }),
            (true, false, true) => items.push(SyncPendingItem {
                path,
                entry_type: SyncPendingEntryType::Directory,
                reason: SyncPendingReason::LocalDeletedRemotePresent,
                local_exists: false,
                remote_exists: true,
                local_modified_at: None,
                remote_modified_at: None,
                latest_resolution: SyncLatestResolution::Undetermined,
                latest_resolution_reason: SyncLatestResolutionReason::DirectoryDeletionConflict,
            }),
            _ => {}
        }
    }

    let (conflicts, skipped_deletion_paths) = legacy_summary_from_pending_items(&items);
    Ok(PendingState {
        items,
        conflicts,
        skipped_deletion_paths,
    })
}

pub(crate) fn collect_pending_state(
    client: &WebDavClient,
    baseline: &SyncBaseline,
    local_snapshot: &LocalSnapshot,
    remote_snapshot: &RemoteSnapshot,
) -> SyncResult<PendingState> {
    let mut remote_hash_cache = BTreeMap::new();
    collect_pending_state_with_resolver(
        baseline,
        local_snapshot,
        remote_snapshot,
        |path, remote| fetch_remote_file_hash(client, remote, path, &mut remote_hash_cache),
    )
}

pub(crate) fn sync_operation_message(
    direction: SyncDirection,
    applied_count: usize,
    pending_count: usize,
) -> String {
    match (direction, applied_count, pending_count) {
        (SyncDirection::Pull, 0, 0) => "没有需要拉取的更新".to_string(),
        (SyncDirection::Push, 0, 0) => "没有需要推送的更新".to_string(),
        (SyncDirection::Pull, _, 0) => format!("已拉取 {applied_count} 项更新"),
        (SyncDirection::Push, _, 0) => format!("已推送 {applied_count} 项更新"),
        (SyncDirection::Pull, 0, pending) => format!("拉取完成，但仍有 {pending} 项待处理差异"),
        (SyncDirection::Push, 0, pending) => format!("推送完成，但仍有 {pending} 项待处理差异"),
        (SyncDirection::Pull, _, pending) => {
            format!("已拉取 {applied_count} 项更新，但仍有 {pending} 项待处理差异")
        }
        (SyncDirection::Push, _, pending) => {
            format!("已推送 {applied_count} 项更新，但仍有 {pending} 项待处理差异")
        }
    }
}

pub(crate) fn resolve_operation_message(
    strategy: SyncResolveStrategy,
    applied_count: usize,
    remaining_count: usize,
) -> String {
    let action = match strategy {
        SyncResolveStrategy::Latest => "按较新一端处理",
        SyncResolveStrategy::Local => "以本地为准处理",
        SyncResolveStrategy::Remote => "以远端为准处理",
    };

    match (applied_count, remaining_count) {
        (0, 0) => "没有需要处理的待处理差异".to_string(),
        (_, 0) => format!("已{action} {applied_count} 项待处理差异"),
        (0, remaining) => format!("未处理任何差异，仍有 {remaining} 项待处理差异"),
        (_, remaining) => {
            format!("已{action} {applied_count} 项待处理差异，仍有 {remaining} 项待处理差异")
        }
    }
}

pub(crate) fn build_resolve_plan(
    strategy: SyncResolveStrategy,
    pending_items: &[SyncPendingItem],
) -> ResolvePlan {
    let mut plan = ResolvePlan::default();

    for item in pending_items {
        let Some(resolution) = planned_resolution_for_item(strategy, item) else {
            continue;
        };

        match (
            item.entry_type,
            resolution,
            item.local_exists,
            item.remote_exists,
        ) {
            (SyncPendingEntryType::File, SyncLatestResolution::Local, true, true)
            | (SyncPendingEntryType::File, SyncLatestResolution::Local, true, false) => {
                plan.upload_files.insert(item.path.clone());
                plan.resolved_file_paths.insert(item.path.clone());
            }
            (SyncPendingEntryType::File, SyncLatestResolution::Remote, true, true)
            | (SyncPendingEntryType::File, SyncLatestResolution::Remote, false, true) => {
                plan.download_files.insert(item.path.clone());
                plan.resolved_file_paths.insert(item.path.clone());
            }
            (SyncPendingEntryType::File, SyncLatestResolution::Local, false, true) => {
                plan.delete_remote_files.insert(item.path.clone());
                plan.removed_file_paths.insert(item.path.clone());
            }
            (SyncPendingEntryType::File, SyncLatestResolution::Remote, true, false) => {
                plan.delete_local_files.insert(item.path.clone());
                plan.removed_file_paths.insert(item.path.clone());
            }
            (SyncPendingEntryType::Directory, SyncLatestResolution::Local, true, false) => {
                plan.create_remote_directories.insert(item.path.clone());
                plan.resolved_directory_paths.insert(item.path.clone());
            }
            (SyncPendingEntryType::Directory, SyncLatestResolution::Remote, false, true) => {
                plan.create_local_directories.insert(item.path.clone());
                plan.resolved_directory_paths.insert(item.path.clone());
            }
            (SyncPendingEntryType::Directory, SyncLatestResolution::Local, false, true) => {
                plan.delete_remote_directories.insert(item.path.clone());
                plan.removed_directory_paths.insert(item.path.clone());
            }
            (SyncPendingEntryType::Directory, SyncLatestResolution::Remote, true, false) => {
                plan.delete_local_directories.insert(item.path.clone());
                plan.removed_directory_paths.insert(item.path.clone());
            }
            _ => continue,
        }

        plan.applied_item_count += 1;
    }

    plan
}

pub(crate) fn path_has_deleted_ancestor(
    path: &str,
    deleted_directories: &BTreeSet<String>,
) -> bool {
    deleted_directories
        .iter()
        .any(|directory| directory != path && path_is_within_directory(path, directory))
}

pub(crate) fn sorted_paths(paths: &BTreeSet<String>, descending: bool) -> Vec<String> {
    let mut values = paths.iter().cloned().collect::<Vec<_>>();
    values.sort_by(|left, right| {
        let depth_cmp = path_depth(left).cmp(&path_depth(right));
        if descending {
            depth_cmp.reverse().then_with(|| left.cmp(right).reverse())
        } else {
            depth_cmp.then_with(|| left.cmp(right))
        }
    });
    values
}

fn parse_http_date_millis(value: &str) -> Option<u64> {
    httpdate::parse_http_date(value)
        .ok()
        .and_then(|value| value.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as u64)
}

fn remote_modified_at(revision: &super::types::RemoteRevision) -> Option<u64> {
    revision
        .last_modified
        .as_deref()
        .and_then(parse_http_date_millis)
}

fn latest_resolution_from_modified_times(
    local_modified_at: Option<u64>,
    remote_modified_at: Option<u64>,
) -> (SyncLatestResolution, SyncLatestResolutionReason) {
    match (local_modified_at, remote_modified_at) {
        (Some(local), Some(remote)) if local > remote => (
            SyncLatestResolution::Local,
            SyncLatestResolutionReason::LocalNewer,
        ),
        (Some(local), Some(remote)) if remote > local => (
            SyncLatestResolution::Remote,
            SyncLatestResolutionReason::RemoteNewer,
        ),
        (Some(_), Some(_)) => (
            SyncLatestResolution::Undetermined,
            SyncLatestResolutionReason::TimestampsEqual,
        ),
        _ => (
            SyncLatestResolution::Undetermined,
            SyncLatestResolutionReason::MissingTimestamp,
        ),
    }
}

fn legacy_summary_from_pending_items(
    items: &[SyncPendingItem],
) -> (Vec<SyncConflict>, Vec<String>) {
    let mut conflicts = Vec::new();
    let mut skipped_deletion_paths = Vec::new();

    for item in items {
        match (item.entry_type, item.reason) {
            (SyncPendingEntryType::File, SyncPendingReason::BothModified) => {
                conflicts.push(SyncConflict {
                    path: item.path.clone(),
                    reason: "bothModified".to_string(),
                });
            }
            (SyncPendingEntryType::File, SyncPendingReason::InitialContentMismatch) => {
                conflicts.push(SyncConflict {
                    path: item.path.clone(),
                    reason: "initialContentMismatch".to_string(),
                });
            }
            (
                SyncPendingEntryType::File,
                SyncPendingReason::LocalAhead | SyncPendingReason::LocalOnly,
            ) => {
                conflicts.push(SyncConflict {
                    path: item.path.clone(),
                    reason: "localOnlyChange".to_string(),
                });
            }
            (
                SyncPendingEntryType::File,
                SyncPendingReason::RemoteAhead | SyncPendingReason::RemoteOnly,
            ) => {
                conflicts.push(SyncConflict {
                    path: item.path.clone(),
                    reason: "remoteOnlyChange".to_string(),
                });
            }
            (_, SyncPendingReason::LocalDeletedRemotePresent)
            | (_, SyncPendingReason::RemoteDeletedLocalPresent) => {
                skipped_deletion_paths.push(item.path.clone());
            }
            _ => {}
        }
    }

    (conflicts, skipped_deletion_paths)
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

fn planned_resolution_for_item(
    strategy: SyncResolveStrategy,
    item: &SyncPendingItem,
) -> Option<SyncLatestResolution> {
    match strategy {
        SyncResolveStrategy::Local => Some(SyncLatestResolution::Local),
        SyncResolveStrategy::Remote => Some(SyncLatestResolution::Remote),
        SyncResolveStrategy::Latest => match item.latest_resolution {
            SyncLatestResolution::Undetermined => None,
            resolution => Some(resolution),
        },
    }
}

fn path_depth(path: &str) -> usize {
    path.split('/')
        .filter(|segment| !segment.is_empty())
        .count()
}

fn path_is_within_directory(path: &str, directory: &str) -> bool {
    path == directory || path.starts_with(&format!("{directory}/"))
}
