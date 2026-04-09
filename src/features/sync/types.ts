export type SyncResultStatus = "success" | "warning" | "error"

export type SyncDirection =
  | "pull"
  | "push"
  | "test"
  | "resolveLatest"
  | "resolveLocal"
  | "resolveRemote"

export type SyncPendingEntryType = "file" | "directory"

export type SyncPendingReason =
  | "bothModified"
  | "initialContentMismatch"
  | "localAhead"
  | "remoteAhead"
  | "localOnly"
  | "remoteOnly"
  | "localDeletedRemotePresent"
  | "remoteDeletedLocalPresent"

export type SyncLatestResolution = "local" | "remote" | "undetermined"

export type SyncLatestResolutionReason =
  | "localOnly"
  | "remoteOnly"
  | "localAhead"
  | "remoteAhead"
  | "localNewer"
  | "remoteNewer"
  | "localDeletionOnly"
  | "remoteDeletionOnly"
  | "missingTimestamp"
  | "timestampsEqual"
  | "deletionConflict"
  | "directoryDeletionConflict"

export type SyncResolveStrategy = "latest" | "local" | "remote"

export interface SyncConflict {
  path: string
  reason:
    | "bothModified"
    | "initialContentMismatch"
    | "localModifiedRemoteDeleted"
    | "localOnlyChange"
    | "remoteModifiedLocalDeleted"
    | "remoteOnlyChange"
}

export interface SyncPendingItem {
  path: string
  entryType: SyncPendingEntryType
  reason: SyncPendingReason
  localExists: boolean
  remoteExists: boolean
  localModifiedAt: number | null
  remoteModifiedAt: number | null
  latestResolution: SyncLatestResolution
  latestResolutionReason: SyncLatestResolutionReason
}

export interface SyncResponse {
  status: SyncResultStatus
  message: string
  changedPaths: string[]
  changedDirectories: string[]
  conflicts: SyncConflict[]
  skippedDeletionPaths: string[]
  pendingItems: SyncPendingItem[]
  syncedAt: number | null
}

export interface SyncState {
  isSettingsLoading: boolean
  isSyncing: boolean
  activeDirection: SyncDirection | null
  lastDirection: SyncDirection | null
  lastResult: SyncResponse | null
  lastSuccessfulSyncAt: number | null
}
