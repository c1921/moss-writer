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

    const textarea = screen.getByLabelText("小说正文编辑区");
    expect((textarea as HTMLTextAreaElement).value).toBe("第一段");

    fireEvent.change(textarea, { target: { value: "新的内容" } });
    expect(updateEditorContentMock).toHaveBeenCalledWith("新的内容");
  });
});
