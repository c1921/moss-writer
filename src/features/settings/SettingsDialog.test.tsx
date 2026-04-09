import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

const useWriterProjectStateMock = vi.fn()
const useWriterSyncActionsMock = vi.fn()
const useWriterSyncStateMock = vi.fn()

vi.mock("@/app/WriterAppContext", () => ({
  useWriterProjectState: () => useWriterProjectStateMock(),
  useWriterSyncActions: () => useWriterSyncActionsMock(),
  useWriterSyncState: () => useWriterSyncStateMock(),
}))

import { SettingsDialog } from "@/features/settings/SettingsDialog"

describe("SettingsDialog", () => {
  const onOpenChangeMock = vi.fn()
  const resolveSyncPendingMock = vi.fn(async () => null)

  beforeEach(() => {
    vi.clearAllMocks()
    useWriterProjectStateMock.mockReturnValue({
      projectPath: "/project",
      files: [],
      currentFilePath: null,
      isProjectLoading: false,
      isFileLoading: false,
    })
    useWriterSyncActionsMock.mockReturnValue({
      reloadSyncSettings: vi.fn(async () => {}),
      saveSyncSettings: vi.fn(async (settings) => settings),
      testSyncConnection: vi.fn(async () => null),
      pullSync: vi.fn(async () => null),
      pushSync: vi.fn(async () => null),
      resolveSyncPending: resolveSyncPendingMock,
    })
    useWriterSyncStateMock.mockReturnValue({
      settings: {
        enabled: true,
        rootUrl: "https://dav.example.com/root",
        username: "writer",
        password: "secret",
        autoPullOnOpen: true,
        autoPushOnSave: true,
        autoPushMinIntervalSeconds: 120,
      },
      isSettingsLoading: false,
      isSyncing: false,
      activeDirection: null,
      lastDirection: "pull",
      lastSuccessfulSyncAt: 1,
      lastResult: {
        status: "warning",
        message: "已拉取 1 项更新，但仍有 2 项待处理差异",
        changedPaths: [],
        changedDirectories: [],
        conflicts: [],
        skippedDeletionPaths: [],
        pendingItems: [
          {
            path: "新章节.md",
            entryType: "file",
            reason: "initialContentMismatch",
            localExists: true,
            remoteExists: true,
            localModifiedAt: 1_000,
            remoteModifiedAt: 2_000,
            latestResolution: "remote",
            latestResolutionReason: "remoteNewer",
          },
          {
            path: "chapters",
            entryType: "directory",
            reason: "remoteDeletedLocalPresent",
            localExists: true,
            remoteExists: false,
            localModifiedAt: null,
            remoteModifiedAt: null,
            latestResolution: "undetermined",
            latestResolutionReason: "directoryDeletionConflict",
          },
        ],
        syncedAt: 1,
      },
    })
  })

  it("展示准确待处理差异文案，并支持批量以远端为准处理", async () => {
    const user = userEvent.setup()

    render(<SettingsDialog onOpenChange={onOpenChangeMock} open />)

    await user.click(screen.getByRole("tab", { name: "WebDAV" }))

    expect(
      screen.getByText("同名文件在本地和远端都存在，但尚未建立同步基线且内容不同")
    ).not.toBeNull()
    expect(
      screen.getByText("按较新无法判断：目录删除差异需要你明确选择")
    ).not.toBeNull()

    await user.click(screen.getByRole("button", { name: "全部以远端为准" }))

    expect(
      screen.getByText("会把远端当前状态同步到本地，本地可能被创建、覆盖或删除。")
    ).not.toBeNull()
    expect(screen.getByText("覆盖文件：1")).not.toBeNull()
    expect(screen.getByText("删除目录：1")).not.toBeNull()

    await user.click(screen.getByRole("button", { name: "确认处理" }))

    await waitFor(() => expect(resolveSyncPendingMock).toHaveBeenCalledWith("remote"))
  })
})
