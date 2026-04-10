import { fireEvent, render, screen } from "@testing-library/react";
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

  it("选中文件后不再显示章节标题和路径，只保留正文编辑区", () => {
    useWriterProjectStateMock.mockReturnValue({
      projectPath: "/project",
      files: [{ name: "chapter-1.md", path: "drafts/chapter-1.md" }],
      currentFilePath: "drafts/chapter-1.md",
      isProjectLoading: false,
      isFileLoading: false,
    });
    useWriterEditorStateMock.mockReturnValue({
      currentFilePath: "drafts/chapter-1.md",
      editorContent: "第一段",
      saveStatus: "saved",
      isDirty: false,
      isFileLoading: false,
    });

    render(<EditorPane />);

    expect(screen.queryByText("当前章节")).toBeNull();
    expect(screen.queryByText("drafts/chapter-1.md")).toBeNull();

    const textarea = screen.getByLabelText("正文编辑区");
    expect((textarea as HTMLTextAreaElement).value).toBe("第一段");

    fireEvent.change(textarea, { target: { value: "新的内容" } });
    expect(updateEditorContentMock).toHaveBeenCalledWith("新的内容");
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
