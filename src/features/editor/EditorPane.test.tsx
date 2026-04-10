import { render, screen, waitFor } from "@testing-library/react";
import { EditorView } from "@codemirror/view";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useWriterProjectStateMock = vi.fn();
const useWriterEditorStateMock = vi.fn();
const updateEditorContentMock = vi.fn();

vi.mock("@/app/WriterAppContext", () => ({
  useWriterProjectState: () => useWriterProjectStateMock(),
  useWriterEditorState: () => useWriterEditorStateMock(),
  useWriterAppActions: () => ({
    updateEditorContent: updateEditorContentMock,
  }),
}));

import { EditorPane } from "@/features/editor/EditorPane";

describe("EditorPane", () => {
  beforeEach(() => {
    useWriterProjectStateMock.mockReset();
    useWriterEditorStateMock.mockReset();
    updateEditorContentMock.mockReset();
  });

  it("选中文件后不再显示章节标题和路径，只保留正文编辑区", async () => {
    useWriterProjectStateMock.mockReturnValue({
      projectPath: "/project",
      files: [{ name: "chapter-1.md", path: "drafts/chapter-1.md" }],
      currentFilePath: "drafts/chapter-1.md",
      isProjectLoading: false,
      isFileLoading: false,
    });
    useWriterEditorStateMock.mockReturnValue({
      currentFilePath: "drafts/chapter-1.md",
      editorContent: "",
      saveStatus: "saved",
      isDirty: false,
      isFileLoading: false,
    });

    render(<EditorPane showLineNumbers={false} />);

    expect(screen.queryByText("当前章节")).toBeNull();
    expect(screen.queryByText("drafts/chapter-1.md")).toBeNull();
    expect(document.querySelector(".cm-lineNumbers")).toBeNull();

    const editor = screen.getByTestId("editor-input") as HTMLElement;
    const view = EditorView.findFromDOM(editor);

    expect(view).not.toBeNull();

    view?.dispatch({
      changes: {
        from: 0,
        insert: "新的内容",
      },
    });

    await waitFor(() =>
      expect(updateEditorContentMock).toHaveBeenLastCalledWith("新的内容")
    );
  });

  it("小窗模式下未打开项目时显示紧凑占位输入区", () => {
    useWriterProjectStateMock.mockReturnValue({
      projectPath: null,
      files: [],
      currentFilePath: null,
      isProjectLoading: false,
      isFileLoading: false,
    });
    useWriterEditorStateMock.mockReturnValue({
      currentFilePath: null,
      editorContent: "",
      saveStatus: "idle",
      isDirty: false,
      isFileLoading: false,
    });

    render(<EditorPane variant="mini" />);

    const textarea = screen.getByLabelText("正文编辑区") as HTMLTextAreaElement;
    expect(textarea.placeholder).toBe("先在正常模式打开一个项目");
    expect(textarea.disabled).toBe(true);
    expect(screen.queryByText("专注写作")).toBeNull();
  });
});
