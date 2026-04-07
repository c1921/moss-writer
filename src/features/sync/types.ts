export type SyncResultStatus = "success" | "warning" | "error"

export type SyncDirection = "pull" | "push" | "test"

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

export interface SyncResponse {
  status: SyncResultStatus
  message: string
  changedPaths: string[]
  changedDirectories: string[]
  conflicts: SyncConflict[]
  skippedDeletionPaths: string[]
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
