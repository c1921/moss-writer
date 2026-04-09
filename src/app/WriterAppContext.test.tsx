import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/shared/tauri/commands", () => ({
  openProject: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  listFiles: vi.fn(),
  createFile: vi.fn(),
  createDirectory: vi.fn(),
  renameFile: vi.fn(),
  deleteFile: vi.fn(),
  getSyncSettings: vi.fn(),
  saveSyncSettings: vi.fn(),
  testSyncConnection: vi.fn(),
  syncPush: vi.fn(),
  syncPull: vi.fn(),
  resolveSyncPending: vi.fn(),
}));

vi.mock("@/shared/tauri/dialog", () => ({
  pickProjectDirectory: vi.fn(),
}));

vi.mock("@/shared/tauri/events", () => ({
  listenProjectFilesChanged: vi.fn(),
}));

import {
  WriterAppProvider,
  useWriterAppActions,
  useWriterAppError,
  useWriterEditorState,
  useWriterProjectState,
} from "@/app/WriterAppContext";
import type { SyncResponse } from "@/features/sync/types";
import * as commands from "@/shared/tauri/commands";
import * as events from "@/shared/tauri/events";

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return {
    promise,
    resolve,
    reject,
  };
}

function TestHarness() {
  const projectState = useWriterProjectState();
  const editorState = useWriterEditorState();
  const appError = useWriterAppError();
  const actions = useWriterAppActions();

  return (
    <div>
      <div data-testid="files">{projectState.files.map((file) => file.path).join("|")}</div>
      <div data-testid="current-file">{editorState.currentFilePath ?? ""}</div>
      <div data-testid="content">{editorState.editorContent}</div>
      <div data-testid="save-status">{editorState.saveStatus}</div>
      <div data-testid="dirty">{String(editorState.isDirty)}</div>
      <div data-testid="error">{appError ?? ""}</div>

      <button onClick={() => void actions.openProjectPath("/project")} type="button">
        open-project
      </button>
      <button onClick={() => void actions.selectFile("second.md")} type="button">
        select-second
      </button>
      <button onClick={() => actions.updateEditorContent("Draft content")} type="button">
        change-content
      </button>
      <button onClick={() => actions.updateEditorContent("Draft content 2")} type="button">
        change-content-2
      </button>
      <button onClick={() => actions.updateEditorContent("Draft content 3")} type="button">
        change-content-3
      </button>
      <button onClick={() => void actions.createFile("drafts/chapter-2")} type="button">
        create-file
      </button>
      <button
        onClick={() => void actions.renameFile("drafts/chapter-2.md", "published/final")}
        type="button"
      >
        rename-file
      </button>
      <button onClick={() => void actions.deleteFile("published/final.md")} type="button">
        delete-file
      </button>
    </div>
  );
}

function renderHarness() {
  return render(
    <WriterAppProvider>
      <TestHarness />
    </WriterAppProvider>,
  );
}

async function waitForMs(ms: number) {
  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, ms));
  });
}

function createSyncResponse(
  status: "success" | "warning" | "error",
  syncedAt: number | null,
): SyncResponse {
  return {
    status,
    message:
      status === "error"
        ? "同步失败"
        : status === "warning"
          ? "推送完成，但仍有待处理差异"
          : "推送完成",
    changedPaths: ["first.md"],
    changedDirectories: [],
    conflicts: [],
    skippedDeletionPaths: [],
    pendingItems:
      status === "warning"
        ? [
            {
              path: "first.md",
              entryType: "file",
              reason: "bothModified",
              localExists: true,
              remoteExists: true,
              localModifiedAt: syncedAt,
              remoteModifiedAt: syncedAt,
              latestResolution: "undetermined",
              latestResolutionReason: "timestampsEqual",
            },
          ]
        : [],
    syncedAt,
  };
}

describe("WriterAppProvider", () => {
  const openProjectMock = vi.mocked(commands.openProject);
  const readFileMock = vi.mocked(commands.readFile);
  const writeFileMock = vi.mocked(commands.writeFile);
  const listFilesMock = vi.mocked(commands.listFiles);
  const createFileMock = vi.mocked(commands.createFile);
  const renameFileMock = vi.mocked(commands.renameFile);
  const deleteFileMock = vi.mocked(commands.deleteFile);
  const getSyncSettingsMock = vi.mocked(commands.getSyncSettings);
  const syncPushMock = vi.mocked(commands.syncPush);
  const syncPullMock = vi.mocked(commands.syncPull);
  const listenProjectFilesChangedMock = vi.mocked(events.listenProjectFilesChanged);
  const unlistenMock = vi.fn();
  let projectFilesChangedHandler:
    | ((payload: events.ProjectFilesChangedEvent) => void)
    | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    projectFilesChangedHandler = null;
    unlistenMock.mockReset();
    getSyncSettingsMock.mockResolvedValue({
      enabled: false,
      rootUrl: "",
      username: "",
      password: "",
      autoPullOnOpen: true,
      autoPushOnSave: true,
      autoPushMinIntervalSeconds: 120,
    });
    listenProjectFilesChangedMock.mockImplementation(async (handler) => {
      projectFilesChangedHandler = handler;
      return unlistenMock;
    });
  });

  it("忽略过期的文件读取结果", async () => {
    const user = userEvent.setup();
    const firstLoad = createDeferred<string>();
    const secondLoad = createDeferred<string>();

    openProjectMock.mockResolvedValue({
      projectPath: "/project",
      files: [
        { name: "first.md", path: "first.md" },
        { name: "second.md", path: "second.md" },
      ],
    });
    readFileMock.mockImplementation((path) => {
      if (path === "first.md") {
        return firstLoad.promise;
      }

      if (path === "second.md") {
        return secondLoad.promise;
      }

      throw new Error(`unexpected path: ${path}`);
    });

    renderHarness();

    await user.click(screen.getByRole("button", { name: "open-project" }));
    await waitFor(() => expect(readFileMock).toHaveBeenCalledWith("first.md"));

    await user.click(screen.getByRole("button", { name: "select-second" }));
    await waitFor(() => expect(readFileMock).toHaveBeenCalledWith("second.md"));

    await act(async () => {
      firstLoad.resolve("first content");
      await firstLoad.promise;
    });

    expect(screen.getByTestId("current-file").textContent).not.toBe("first.md");

    await act(async () => {
      secondLoad.resolve("second content");
      await secondLoad.promise;
    });

    await waitFor(() => expect(screen.getByTestId("current-file").textContent).toBe("second.md"));
    expect(screen.getByTestId("content").textContent).toBe("second content");
  });

  it("保存失败时阻止切换文件并保留脏状态", async () => {
    const user = userEvent.setup();

    openProjectMock.mockResolvedValue({
      projectPath: "/project",
      files: [
        { name: "first.md", path: "first.md" },
        { name: "second.md", path: "second.md" },
      ],
    });
    readFileMock.mockImplementation((path) =>
      Promise.resolve(path === "first.md" ? "first content" : "second content"),
    );
    writeFileMock.mockRejectedValue(new Error("保存失败"));

    renderHarness();

    await user.click(screen.getByRole("button", { name: "open-project" }));
    await waitFor(() => expect(screen.getByTestId("current-file").textContent).toBe("first.md"));

    await user.click(screen.getByRole("button", { name: "change-content" }));
    expect(screen.getByTestId("dirty").textContent).toBe("true");

    await user.click(screen.getByRole("button", { name: "select-second" }));

    await waitFor(() =>
      expect(writeFileMock).toHaveBeenCalledWith("first.md", "Draft content"),
    );
    expect(screen.getByTestId("current-file").textContent).toBe("first.md");
    expect(screen.getByTestId("content").textContent).toBe("Draft content");
    expect(screen.getByTestId("dirty").textContent).toBe("true");
    expect(screen.getByTestId("save-status").textContent).toBe("error");
    expect(screen.getByTestId("error").textContent).toContain("保存失败");
    expect(readFileMock).toHaveBeenCalledTimes(1);
  });

  it("创建、重命名和删除文件时不依赖全量刷新", async () => {
    const user = userEvent.setup();

    openProjectMock.mockResolvedValue({
      projectPath: "/project",
      files: [{ name: "chapter-1.md", path: "drafts/chapter-1.md" }],
    });
    readFileMock.mockImplementation((path) => {
      if (path === "drafts/chapter-1.md") {
        return Promise.resolve("chapter 1");
      }

      if (path === "drafts/chapter-2.md") {
        return Promise.resolve("");
      }

      if (path === "published/final.md") {
        return Promise.resolve("");
      }

      throw new Error(`unexpected path: ${path}`);
    });
    createFileMock.mockResolvedValue({
      name: "chapter-2.md",
      path: "drafts/chapter-2.md",
    });
    renameFileMock.mockResolvedValue({
      name: "final.md",
      path: "published/final.md",
    });
    deleteFileMock.mockResolvedValue();

    renderHarness();

    await user.click(screen.getByRole("button", { name: "open-project" }));
    await waitFor(() =>
      expect(screen.getByTestId("current-file").textContent).toBe("drafts/chapter-1.md"),
    );

    await user.click(screen.getByRole("button", { name: "create-file" }));
    await waitFor(() =>
      expect(screen.getByTestId("current-file").textContent).toBe("drafts/chapter-2.md"),
    );
    expect(screen.getByTestId("files").textContent).toBe(
      "drafts/chapter-1.md|drafts/chapter-2.md",
    );

    await user.click(screen.getByRole("button", { name: "rename-file" }));
    await waitFor(() =>
      expect(screen.getByTestId("current-file").textContent).toBe("published/final.md"),
    );
    expect(screen.getByTestId("files").textContent).toBe(
      "drafts/chapter-1.md|published/final.md",
    );

    await user.click(screen.getByRole("button", { name: "delete-file" }));
    await waitFor(() =>
      expect(screen.getByTestId("current-file").textContent).toBe("drafts/chapter-1.md"),
    );
    expect(screen.getByTestId("files").textContent).toBe("drafts/chapter-1.md");
    expect(listFilesMock).not.toHaveBeenCalled();
  });

  it("恢复会话时在目标文件不存在时回退到首个文件", async () => {
    openProjectMock.mockResolvedValue({
      projectPath: "/project",
      files: [
        { name: "first.md", path: "first.md" },
        { name: "second.md", path: "second.md" },
      ],
    });
    readFileMock.mockResolvedValue("restored content");

    localStorage.setItem(
      "moss-writer/session-v1",
      JSON.stringify({
        projectPath: "/project",
        currentFilePath: "missing.md",
      }),
    );

    renderHarness();

    await waitFor(() => expect(openProjectMock).toHaveBeenCalledWith("/project"));
    await waitFor(() => expect(screen.getByTestId("current-file").textContent).toBe("first.md"));
    expect(screen.getByTestId("content").textContent).toBe("restored content");
  });

  it("打开项目时会按设置自动拉取后再载入最新文件", async () => {
    const user = userEvent.setup();

    getSyncSettingsMock.mockResolvedValue({
      enabled: true,
      rootUrl: "https://dav.example.com/root",
      username: "writer",
      password: "secret",
      autoPullOnOpen: true,
      autoPushOnSave: false,
      autoPushMinIntervalSeconds: 120,
    });
    openProjectMock.mockResolvedValue({
      projectPath: "/project",
      files: [{ name: "first.md", path: "first.md" }],
    });
    syncPullMock.mockResolvedValue({
      status: "success",
      message: "已拉取 1 项更新",
      changedPaths: ["remote.md"],
      changedDirectories: [],
      conflicts: [],
      skippedDeletionPaths: [],
      pendingItems: [],
      syncedAt: 1,
    });
    listFilesMock.mockResolvedValue([{ name: "remote.md", path: "remote.md" }]);
    readFileMock.mockImplementation(async (path) => {
      if (path === "remote.md") {
        return "remote content";
      }

      throw new Error(`unexpected path: ${path}`);
    });

    renderHarness();

    await user.click(screen.getByRole("button", { name: "open-project" }));

    await waitFor(() => expect(syncPullMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(listFilesMock).toHaveBeenCalledWith("/project"));
    await waitFor(() => expect(screen.getByTestId("current-file").textContent).toBe("remote.md"));
    expect(screen.getByTestId("content").textContent).toBe("remote content");
  });

  it("已落盘改动会在间隔到点后自动推送，即使没有新的保存触发", async () => {
    const user = userEvent.setup();

    getSyncSettingsMock.mockResolvedValue({
      enabled: true,
      rootUrl: "https://dav.example.com/root",
      username: "writer",
      password: "secret",
      autoPullOnOpen: false,
      autoPushOnSave: true,
      autoPushMinIntervalSeconds: 2,
    });
    openProjectMock.mockResolvedValue({
      projectPath: "/project",
      files: [{ name: "first.md", path: "first.md" }],
    });
    readFileMock.mockResolvedValue("first content");
    writeFileMock.mockResolvedValue();
    syncPushMock.mockImplementation(async () => createSyncResponse("success", Date.now()));

    renderHarness();

    await user.click(screen.getByRole("button", { name: "open-project" }));
    await waitFor(() => expect(screen.getByTestId("current-file").textContent).toBe("first.md"));

    await user.click(screen.getByRole("button", { name: "change-content" }));

    await waitForMs(900);

    await waitFor(() =>
      expect(writeFileMock).toHaveBeenCalledWith("first.md", "Draft content"),
    );
    await waitFor(() => expect(syncPushMock).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole("button", { name: "change-content-2" }));

    await waitForMs(900);

    await waitFor(() =>
      expect(writeFileMock).toHaveBeenCalledWith("first.md", "Draft content 2"),
    );
    expect(syncPushMock).toHaveBeenCalledTimes(1);

    await waitForMs(1_150);

    await waitFor(() => expect(syncPushMock).toHaveBeenCalledTimes(2));
    expect(writeFileMock).toHaveBeenCalledTimes(2);
  });

  it("自动推送不会顺带保存尚未落盘的编辑内容", async () => {
    const user = userEvent.setup();

    getSyncSettingsMock.mockResolvedValue({
      enabled: true,
      rootUrl: "https://dav.example.com/root",
      username: "writer",
      password: "secret",
      autoPullOnOpen: false,
      autoPushOnSave: true,
      autoPushMinIntervalSeconds: 2,
    });
    openProjectMock.mockResolvedValue({
      projectPath: "/project",
      files: [{ name: "first.md", path: "first.md" }],
    });
    readFileMock.mockResolvedValue("first content");
    writeFileMock.mockResolvedValue();
    syncPushMock.mockImplementation(async () => createSyncResponse("success", Date.now()));

    renderHarness();

    await user.click(screen.getByRole("button", { name: "open-project" }));
    await waitFor(() => expect(screen.getByTestId("current-file").textContent).toBe("first.md"));

    await user.click(screen.getByRole("button", { name: "change-content" }));

    await waitForMs(900);

    await waitFor(() => expect(syncPushMock).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole("button", { name: "change-content-2" }));

    await waitForMs(900);

    await waitFor(() =>
      expect(writeFileMock).toHaveBeenCalledWith("first.md", "Draft content 2"),
    );
    expect(syncPushMock).toHaveBeenCalledTimes(1);

    await waitForMs(700);

    await user.click(screen.getByRole("button", { name: "change-content-3" }));
    expect(screen.getByTestId("dirty").textContent).toBe("true");

    await waitForMs(500);

    await waitFor(() => expect(syncPushMock).toHaveBeenCalledTimes(2));
    expect(writeFileMock).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("dirty").textContent).toBe("true");
  });

  it("创建、重命名和删除文件会在满足间隔时自动推送", async () => {
    const user = userEvent.setup();

    getSyncSettingsMock.mockResolvedValue({
      enabled: true,
      rootUrl: "https://dav.example.com/root",
      username: "writer",
      password: "secret",
      autoPullOnOpen: false,
      autoPushOnSave: true,
      autoPushMinIntervalSeconds: 1,
    });
    openProjectMock.mockResolvedValue({
      projectPath: "/project",
      files: [{ name: "chapter-1.md", path: "drafts/chapter-1.md" }],
    });
    readFileMock.mockImplementation((path) => {
      if (path === "drafts/chapter-1.md") {
        return Promise.resolve("chapter 1");
      }

      if (path === "drafts/chapter-2.md") {
        return Promise.resolve("");
      }

      if (path === "published/final.md") {
        return Promise.resolve("");
      }

      throw new Error(`unexpected path: ${path}`);
    });
    createFileMock.mockResolvedValue({
      name: "chapter-2.md",
      path: "drafts/chapter-2.md",
    });
    renameFileMock.mockResolvedValue({
      name: "final.md",
      path: "published/final.md",
    });
    deleteFileMock.mockResolvedValue();
    syncPushMock.mockImplementation(async () => createSyncResponse("success", Date.now()));

    renderHarness();

    await user.click(screen.getByRole("button", { name: "open-project" }));
    await waitFor(() =>
      expect(screen.getByTestId("current-file").textContent).toBe("drafts/chapter-1.md"),
    );

    await user.click(screen.getByRole("button", { name: "create-file" }));
    await waitFor(() => expect(syncPushMock).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole("button", { name: "rename-file" }));
    expect(syncPushMock).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "delete-file" }));
    expect(syncPushMock).toHaveBeenCalledTimes(1);
    await waitForMs(1_100);

    await waitFor(() => expect(syncPushMock).toHaveBeenCalledTimes(2));
  });

  it("外部已落盘文件变更会自动进入推送队列", async () => {
    const user = userEvent.setup();

    getSyncSettingsMock.mockResolvedValue({
      enabled: true,
      rootUrl: "https://dav.example.com/root",
      username: "writer",
      password: "secret",
      autoPullOnOpen: false,
      autoPushOnSave: true,
      autoPushMinIntervalSeconds: 1,
    });
    openProjectMock.mockResolvedValue({
      projectPath: "/project",
      files: [{ name: "first.md", path: "first.md" }],
    });
    readFileMock.mockImplementation(async (path) => {
      if (path !== "first.md") {
        throw new Error(`unexpected path: ${path}`);
      }

      return "external content";
    });
    listFilesMock.mockResolvedValue([{ name: "first.md", path: "first.md" }]);
    syncPushMock.mockImplementation(async () => createSyncResponse("success", Date.now()));

    renderHarness();

    await user.click(screen.getByRole("button", { name: "open-project" }));
    await waitFor(() => expect(screen.getByTestId("current-file").textContent).toBe("first.md"));

    act(() => {
      projectFilesChangedHandler?.({
        projectPath: "/project",
        kind: "modify",
        paths: ["first.md"],
      });
    });

    await waitForMs(250);

    await waitFor(() => expect(listFilesMock).toHaveBeenCalledWith("/project"));
    await waitFor(() => expect(syncPushMock).toHaveBeenCalledTimes(1));
  });

  it("自动推送失败后会按最小间隔继续重试", async () => {
    const user = userEvent.setup();

    getSyncSettingsMock.mockResolvedValue({
      enabled: true,
      rootUrl: "https://dav.example.com/root",
      username: "writer",
      password: "secret",
      autoPullOnOpen: false,
      autoPushOnSave: true,
      autoPushMinIntervalSeconds: 1,
    });
    openProjectMock.mockResolvedValue({
      projectPath: "/project",
      files: [{ name: "first.md", path: "first.md" }],
    });
    readFileMock.mockResolvedValue("first content");
    writeFileMock.mockResolvedValue();
    syncPushMock.mockImplementation(async () => createSyncResponse("error", null));

    renderHarness();

    await user.click(screen.getByRole("button", { name: "open-project" }));
    await waitFor(() => expect(screen.getByTestId("current-file").textContent).toBe("first.md"));

    await user.click(screen.getByRole("button", { name: "change-content" }));

    await waitForMs(900);

    await waitFor(() => expect(syncPushMock).toHaveBeenCalledTimes(1));

    await waitForMs(1_100);

    await waitFor(() => expect(syncPushMock).toHaveBeenCalledTimes(2));
  });

  it("自动推送告警结果不会在无新改动时重复重试", async () => {
    const user = userEvent.setup();

    getSyncSettingsMock.mockResolvedValue({
      enabled: true,
      rootUrl: "https://dav.example.com/root",
      username: "writer",
      password: "secret",
      autoPullOnOpen: false,
      autoPushOnSave: true,
      autoPushMinIntervalSeconds: 1,
    });
    openProjectMock.mockResolvedValue({
      projectPath: "/project",
      files: [{ name: "first.md", path: "first.md" }],
    });
    readFileMock.mockResolvedValue("first content");
    writeFileMock.mockResolvedValue();
    syncPushMock.mockImplementation(async () => createSyncResponse("warning", Date.now()));

    renderHarness();

    await user.click(screen.getByRole("button", { name: "open-project" }));
    await waitFor(() => expect(screen.getByTestId("current-file").textContent).toBe("first.md"));

    await user.click(screen.getByRole("button", { name: "change-content" }));

    await waitForMs(900);

    await waitFor(() => expect(syncPushMock).toHaveBeenCalledTimes(1));

    await waitForMs(1_100);

    expect(syncPushMock).toHaveBeenCalledTimes(1);
  });

  it("监听到当前文件外部变更时会自动重载编辑区", async () => {
    const user = userEvent.setup();
    let firstRead = true;

    openProjectMock.mockResolvedValue({
      projectPath: "/project",
      files: [{ name: "first.md", path: "first.md" }],
    });
    readFileMock.mockImplementation(async (path) => {
      if (path !== "first.md") {
        throw new Error(`unexpected path: ${path}`);
      }

      if (firstRead) {
        firstRead = false;
        return "first content";
      }

      return "external content";
    });
    listFilesMock.mockResolvedValue([{ name: "first.md", path: "first.md" }]);

    renderHarness();

    await user.click(screen.getByRole("button", { name: "open-project" }));
    await waitFor(() => expect(screen.getByTestId("content").textContent).toBe("first content"));

    act(() => {
      projectFilesChangedHandler?.({
        projectPath: "/project",
        kind: "modify",
        paths: ["first.md"],
      });
    });

    await waitFor(() => expect(listFilesMock).toHaveBeenCalledWith("/project"));
    await waitFor(() =>
      expect(screen.getByTestId("content").textContent).toBe("external content"),
    );
  });

  it("监听到当前文件被外部删除时会回退到首个可用文件", async () => {
    const user = userEvent.setup();

    openProjectMock.mockResolvedValue({
      projectPath: "/project",
      files: [
        { name: "first.md", path: "first.md" },
        { name: "second.md", path: "second.md" },
      ],
    });
    readFileMock.mockImplementation(async (path) => {
      if (path === "first.md") {
        return "first content";
      }

      if (path === "second.md") {
        return "second content";
      }

      throw new Error(`unexpected path: ${path}`);
    });
    listFilesMock.mockResolvedValue([{ name: "second.md", path: "second.md" }]);

    renderHarness();

    await user.click(screen.getByRole("button", { name: "open-project" }));
    await waitFor(() =>
      expect(screen.getByTestId("current-file").textContent).toBe("first.md"),
    );

    act(() => {
      projectFilesChangedHandler?.({
        projectPath: "/project",
        kind: "remove",
        paths: ["first.md"],
      });
    });

    await waitFor(() =>
      expect(screen.getByTestId("current-file").textContent).toBe("second.md"),
    );
    expect(screen.getByTestId("files").textContent).toBe("second.md");
    expect(screen.getByTestId("content").textContent).toBe("second content");
  });

  it("当前文件有未保存内容时遇到外部改动会放弃本地定时保存并重载磁盘内容", async () => {
    const user = userEvent.setup();
    let firstRead = true;

    openProjectMock.mockResolvedValue({
      projectPath: "/project",
      files: [{ name: "first.md", path: "first.md" }],
    });
    readFileMock.mockImplementation(async () => {
      if (firstRead) {
        firstRead = false;
        return "first content";
      }

      return "external content";
    });
    listFilesMock.mockResolvedValue([{ name: "first.md", path: "first.md" }]);

    renderHarness();

    await user.click(screen.getByRole("button", { name: "open-project" }));
    await waitFor(() => expect(screen.getByTestId("content").textContent).toBe("first content"));

    await user.click(screen.getByRole("button", { name: "change-content" }));
    expect(screen.getByTestId("dirty").textContent).toBe("true");

    act(() => {
      projectFilesChangedHandler?.({
        projectPath: "/project",
        kind: "modify",
        paths: ["first.md"],
      });
    });

    await waitFor(() =>
      expect(screen.getByTestId("content").textContent).toBe("external content"),
    );
    expect(screen.getByTestId("dirty").textContent).toBe("false");

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 900));
    });

    expect(writeFileMock).not.toHaveBeenCalled();
  });
});
