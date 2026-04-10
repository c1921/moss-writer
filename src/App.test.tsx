import type React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useWriterAppActionsMock = vi.fn();
const useWriterAppErrorMock = vi.fn();
const useMiniWindowModeMock = vi.fn();

vi.mock("@/app/WriterAppContext", () => ({
  WriterAppProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useWriterAppActions: () => useWriterAppActionsMock(),
  useWriterAppError: () => useWriterAppErrorMock(),
}));

vi.mock("@/app/hooks/useMiniWindowMode", () => ({
  useMiniWindowMode: () => useMiniWindowModeMock(),
}));

vi.mock("@/components/ui/sidebar", () => ({
  SidebarProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sidebar-provider">{children}</div>
  ),
  SidebarInset: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sidebar-inset">{children}</div>
  ),
  SidebarTrigger: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>toggle-sidebar</button>
  ),
}));

vi.mock("@/features/fileManager/FileSidebar", () => ({
  FileSidebar: ({
    onOpenSettings,
  }: {
    onOpenSettings: (tab: "editor" | "webdav") => void;
  }) => (
    <div>
      <div data-testid="file-sidebar">sidebar</div>
      <button onClick={() => onOpenSettings("editor")} type="button">
        sidebar-settings
      </button>
    </div>
  ),
}));

vi.mock("@/features/editor/EditorCurrentFileName", () => ({
  EditorCurrentFileName: () => <div data-testid="current-file-name">chapter.md</div>,
}));

vi.mock("@/features/editor/EditorPane", () => ({
  EditorPane: ({ variant }: { variant?: "standard" | "mini" }) => (
    <div data-testid={`editor-pane-${variant ?? "standard"}`}>editor</div>
  ),
}));

vi.mock("@/features/editor/EditorSaveStatusBadge", () => ({
  EditorSaveStatusBadge: ({
    compact,
    showUnavailable,
  }: {
    compact?: boolean;
    showUnavailable?: boolean;
  }) => (
    <div data-testid={compact ? "save-status-compact" : "save-status-standard"}>
      {showUnavailable ? "save-unavailable" : "save"}
    </div>
  ),
}));

vi.mock("@/features/sync/SyncStatusButton", () => ({
  SyncStatusButton: ({
    compact,
    onClick,
  }: {
    compact?: boolean;
    onClick: () => void;
  }) => (
    <button
      data-testid={compact ? "sync-status-compact" : "sync-status-standard"}
      onClick={onClick}
      type="button"
    >
      sync
    </button>
  ),
}));

vi.mock("@/features/settings/SettingsDialog", () => ({
  SettingsDialog: ({
    open,
    initialTab,
  }: {
    open: boolean;
    initialTab?: string;
  }) => (
    <div data-testid="settings-dialog">
      {open ? `open:${initialTab ?? "editor"}` : "closed"}
    </div>
  ),
}));

import App from "@/App";

describe("App", () => {
  const clearErrorMock = vi.fn();
  const enterMiniWindowModeMock = vi.fn(async () => {});
  const exitMiniWindowModeMock = vi.fn(async () => {});
  const startWindowDraggingMock = vi.fn(async () => {});

  beforeEach(() => {
    vi.clearAllMocks();
    useWriterAppActionsMock.mockReturnValue({
      clearError: clearErrorMock,
    });
    useWriterAppErrorMock.mockReturnValue(null);
    useMiniWindowModeMock.mockReturnValue({
      isMiniWindowMode: false,
      enterMiniWindowMode: enterMiniWindowModeMock,
      exitMiniWindowMode: exitMiniWindowModeMock,
      startWindowDragging: startWindowDraggingMock,
    });
  });

  it("标准模式下保留侧边栏和顶部按钮，并可进入小窗", () => {
    useWriterAppErrorMock.mockReturnValue("保存失败");

    render(<App />);

    expect(screen.getByTestId("file-sidebar")).not.toBeNull();
    expect(screen.getByTestId("editor-pane-standard")).not.toBeNull();
    expect(screen.getByText("保存失败")).not.toBeNull();
    expect(screen.getByTestId("settings-dialog").textContent).toBe("closed");

    fireEvent.click(screen.getByRole("button", { name: "小窗" }));

    expect(enterMiniWindowModeMock).toHaveBeenCalledTimes(1);
  });

  it("标准模式点击同步状态会打开设置窗口", () => {
    render(<App />);

    fireEvent.click(screen.getByTestId("sync-status-standard"));

    expect(screen.getByTestId("settings-dialog").textContent).toBe("open:webdav");
  });

  it("点击侧边栏设置按钮会打开编辑器设置", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "sidebar-settings" }));

    expect(screen.getByTestId("settings-dialog").textContent).toBe("open:editor");
  });

  it("小窗模式下展示紧凑壳层，并支持拖动和退出后打开设置", async () => {
    useMiniWindowModeMock.mockReturnValue({
      isMiniWindowMode: true,
      enterMiniWindowMode: enterMiniWindowModeMock,
      exitMiniWindowMode: exitMiniWindowModeMock,
      startWindowDragging: startWindowDraggingMock,
    });

    render(<App />);

    expect(screen.queryByTestId("file-sidebar")).toBeNull();
    expect(screen.getByTestId("mini-window-workspace")).not.toBeNull();
    expect(screen.getByTestId("editor-pane-mini")).not.toBeNull();
    expect(screen.getByTestId("save-status-compact")).not.toBeNull();

    fireEvent.mouseDown(screen.getByTestId("mini-window-drag-bar"), { button: 0 });
    expect(startWindowDraggingMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId("sync-status-compact"));

    await waitFor(() => {
      expect(exitMiniWindowModeMock).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("settings-dialog").textContent).toBe("open:webdav");
    });

    fireEvent.click(screen.getByRole("button", { name: "退出小窗模式" }));
    expect(exitMiniWindowModeMock).toHaveBeenCalledTimes(2);
  });
});
