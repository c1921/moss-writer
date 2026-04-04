import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/shared/tauri/commands", () => ({
  openProject: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  listFiles: vi.fn(),
  createFile: vi.fn(),
  renameFile: vi.fn(),
  deleteFile: vi.fn(),
  syncPush: vi.fn(),
  syncPull: vi.fn(),
}));

vi.mock("@/shared/tauri/dialog", () => ({
  pickProjectDirectory: vi.fn(),
}));

import {
  WriterAppProvider,
  useWriterAppActions,
  useWriterAppError,
  useWriterEditorState,
  useWriterProjectState,
} from "@/app/WriterAppContext";
import * as commands from "@/shared/tauri/commands";

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

describe("WriterAppProvider", () => {
  const openProjectMock = vi.mocked(commands.openProject);
  const readFileMock = vi.mocked(commands.readFile);
  const writeFileMock = vi.mocked(commands.writeFile);
  const listFilesMock = vi.mocked(commands.listFiles);
  const createFileMock = vi.mocked(commands.createFile);
  const renameFileMock = vi.mocked(commands.renameFile);
  const deleteFileMock = vi.mocked(commands.deleteFile);

  beforeEach(() => {
    localStorage.clear();
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
});
