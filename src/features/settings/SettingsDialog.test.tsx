import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useSyncExternalStore } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const useWriterProjectStateMock = vi.fn()
const useWriterSyncActionsMock = vi.fn()
const useWriterSyncStateMock = vi.fn()
const getVersionMock = vi.fn()

vi.mock("@/app/WriterAppContext", () => ({
  useWriterProjectState: () => useWriterProjectStateMock(),
  useWriterSyncActions: () => useWriterSyncActionsMock(),
  useWriterSyncState: () => useWriterSyncStateMock(),
}))

vi.mock("@tauri-apps/api/app", () => ({
  getVersion: () => getVersionMock(),
}))

import { SettingsDialog } from "@/features/settings/SettingsDialog"
import type { AppearanceSettings } from "@/app/appearanceSettings"
import type { WebDavSettings } from "@/features/settings/types"

const defaultAppearance: AppearanceSettings = {
  mainEditorFontSize: 16,
  miniEditorFontSize: 15,
  miniWindowOpacity: 78,
  miniWindowShowStatusBar: true,
  showLineNumbers: true,
}

describe("SettingsDialog", () => {
  const onOpenChangeMock = vi.fn()
  const resolveSyncPendingMock = vi.fn(async () => null)
  const pullSyncMock = vi.fn(async () => null)
  const saveSyncSettingsMock = vi.fn(async (settings: WebDavSettings) => settings)
  const reloadSyncSettingsMock = vi.fn(async () => {})

  function createSyncSettingsStore(initial: WebDavSettings) {
    let current = initial
    const listeners = new Set<() => void>()

    return {
      getSnapshot: () => current,
      set(next: WebDavSettings) {
        current = next
        listeners.forEach((listener) => listener())
      },
      subscribe(listener: () => void) {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
    }
  }

  let syncSettingsStore: ReturnType<typeof createSyncSettingsStore>
  let baseSyncSettings: WebDavSettings

  beforeEach(() => {
    vi.clearAllMocks()
    getVersionMock.mockResolvedValue("1.2.3")
    baseSyncSettings = {
      enabled: true,
      rootUrl: "https://dav.example.com/root",
      username: "writer",
      password: "secret",
      autoPullOnOpen: true,
      autoPushOnSave: true,
      autoPushMinIntervalSeconds: 120,
    }
    syncSettingsStore = createSyncSettingsStore(baseSyncSettings)
    useWriterProjectStateMock.mockReturnValue({
      projectPath: "/project",
      files: [],
      currentFilePath: null,
      isProjectLoading: false,
      isFileLoading: false,
    })
    saveSyncSettingsMock.mockImplementation(async (settings) => {
      syncSettingsStore.set(settings)
      return settings
    })
    reloadSyncSettingsMock.mockImplementation(async () => {
      syncSettingsStore.set({
        ...syncSettingsStore.getSnapshot(),
        rootUrl: "https://dav.example.com/reloaded",
        username: "reloaded-user",
        password: "reloaded-secret",
      })
    })
    useWriterSyncActionsMock.mockReturnValue({
      reloadSyncSettings: reloadSyncSettingsMock,
      saveSyncSettings: saveSyncSettingsMock,
      testSyncConnection: vi.fn(async () => null),
      pullSync: pullSyncMock,
      pushSync: vi.fn(async () => null),
      resolveSyncPending: resolveSyncPendingMock,
    })
    useWriterSyncStateMock.mockImplementation(() => {
      const settings = useSyncExternalStore(
        syncSettingsStore.subscribe,
        syncSettingsStore.getSnapshot
      )

      return {
        settings,
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
      }
    })
  })

  it("展示准确待处理差异文案，并支持批量以远端为准处理", async () => {
    const user = userEvent.setup()

    render(<SettingsDialog appearance={defaultAppearance} onChangeAppearance={vi.fn()} onOpenChange={onOpenChangeMock} open />)

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

  it("展示托盘与最小化到托盘的快捷键说明", async () => {
    const user = userEvent.setup()

    render(<SettingsDialog appearance={defaultAppearance} onChangeAppearance={vi.fn()} onOpenChange={onOpenChangeMock} open />)

    await user.click(screen.getByRole("tab", { name: "快捷键" }))

    expect(screen.getByText("托盘与快捷键")).not.toBeNull()
    expect(screen.getByText("Ctrl + Backquote")).not.toBeNull()
    expect(screen.getByText("系统级全局快捷键。窗口可见时隐藏到托盘，已在托盘时再次按下会恢复并聚焦主窗口。")).not.toBeNull()
    expect(screen.getByText("保持普通最小化行为，不会隐藏到托盘。")).not.toBeNull()
    expect(screen.getByText("恢复并聚焦主窗口。托盘菜单同时提供“显示主窗口”和“退出”。")).not.toBeNull()
  })

  it("展示关于页中的应用版本号", async () => {
    const user = userEvent.setup()

    render(<SettingsDialog appearance={defaultAppearance} onChangeAppearance={vi.fn()} onOpenChange={onOpenChangeMock} open />)

    await user.click(screen.getByRole("tab", { name: "关于" }))

    await waitFor(() => expect(screen.getByText("1.2.3")).not.toBeNull())
    expect(screen.getByText("关于 Moss Writer")).not.toBeNull()
  })

  it("版本读取失败时展示未知状态", async () => {
    const user = userEvent.setup()
    getVersionMock.mockRejectedValueOnce(new Error("boom"))

    render(<SettingsDialog appearance={defaultAppearance} onChangeAppearance={vi.fn()} onOpenChange={onOpenChangeMock} open />)

    await user.click(screen.getByRole("tab", { name: "关于" }))

    await waitFor(() => expect(screen.getByText("未知")).not.toBeNull())
  })

  it("只展示有内容的设置页签，并默认落到编辑器页", () => {
    render(<SettingsDialog appearance={defaultAppearance} onChangeAppearance={vi.fn()} onOpenChange={onOpenChangeMock} open />)

    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "编辑器",
      "外观",
      "快捷键",
      "WebDAV",
      "关于",
    ])
    expect(screen.queryByRole("tab", { name: "基本设置" })).toBeNull()
    expect(screen.queryByRole("tab", { name: "Git" })).toBeNull()
    expect(screen.getByText("主窗口字体大小")).not.toBeNull()
    expect(screen.queryByText("WebDAV 连接")).toBeNull()
  })

  it("编辑器页可以切换显示行号，外观页只展示小窗外观项", async () => {
    const user = userEvent.setup()
    const onChangeAppearanceMock = vi.fn()

    render(
      <SettingsDialog
        appearance={defaultAppearance}
        onChangeAppearance={onChangeAppearanceMock}
        onOpenChange={onOpenChangeMock}
        open
      />
    )

    expect(screen.getByText("主窗口字体大小")).not.toBeNull()
    expect(screen.queryByText("小窗背景不透明度")).toBeNull()

    await user.click(screen.getByRole("switch", { name: "显示行号" }))

    expect(onChangeAppearanceMock).toHaveBeenCalledWith({
      ...defaultAppearance,
      showLineNumbers: false,
    })

    await user.click(screen.getByRole("tab", { name: "外观" }))

    expect(screen.getByText("小窗背景不透明度")).not.toBeNull()
    expect(screen.getByText("小窗显示状态栏")).not.toBeNull()
    expect(screen.queryByText("主窗口字体大小")).toBeNull()
    expect(screen.queryByText("显示行号")).toBeNull()
  })

  it("在 WebDAV 页保存设置后仍停留在当前标签页", async () => {
    const user = userEvent.setup()

    render(<SettingsDialog appearance={defaultAppearance} onChangeAppearance={vi.fn()} onOpenChange={onOpenChangeMock} open />)

    await user.click(screen.getByRole("tab", { name: "WebDAV" }))
    await user.clear(screen.getByLabelText("WebDAV 根地址"))
    await user.type(screen.getByLabelText("WebDAV 根地址"), "https://dav.example.com/updated")
    await user.click(screen.getByRole("button", { name: "保存设置" }))

    await waitFor(() =>
      expect(saveSyncSettingsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          rootUrl: "https://dav.example.com/updated",
        })
      )
    )
    await waitFor(() =>
      expect(screen.getByDisplayValue("https://dav.example.com/updated")).not.toBeNull()
    )
    expect(screen.getByText("WebDAV 连接")).not.toBeNull()
    expect(screen.queryByText("基本设置（即将推出）")).toBeNull()
  })

  it("在 WebDAV 页重新载入设置后仍停留在当前标签页", async () => {
    const user = userEvent.setup()

    render(<SettingsDialog appearance={defaultAppearance} onChangeAppearance={vi.fn()} onOpenChange={onOpenChangeMock} open />)

    await user.click(screen.getByRole("tab", { name: "WebDAV" }))
    await user.click(screen.getByRole("button", { name: "重新载入设置" }))

    await waitFor(() => expect(reloadSyncSettingsMock).toHaveBeenCalled())
    await waitFor(() =>
      expect(screen.getByDisplayValue("https://dav.example.com/reloaded")).not.toBeNull()
    )
    expect(screen.getByText("WebDAV 连接")).not.toBeNull()
    expect(screen.queryByText("基本设置（即将推出）")).toBeNull()
  })

  it("在 WebDAV 页执行立即拉取时，隐式保存后仍停留在当前标签页", async () => {
    const user = userEvent.setup()

    render(<SettingsDialog appearance={defaultAppearance} onChangeAppearance={vi.fn()} onOpenChange={onOpenChangeMock} open />)

    await user.click(screen.getByRole("tab", { name: "WebDAV" }))
    await user.clear(screen.getByLabelText("WebDAV 根地址"))
    await user.type(screen.getByLabelText("WebDAV 根地址"), "https://dav.example.com/pull-before-save")
    await user.click(screen.getByRole("button", { name: "立即拉取" }))

    await waitFor(() => expect(saveSyncSettingsMock).toHaveBeenCalled())
    await waitFor(() => expect(pullSyncMock).toHaveBeenCalled())
    await waitFor(() =>
      expect(screen.getByDisplayValue("https://dav.example.com/pull-before-save")).not.toBeNull()
    )
    expect(screen.getByText("WebDAV 连接")).not.toBeNull()
    expect(screen.queryByText("基本设置（即将推出）")).toBeNull()
  })

})
