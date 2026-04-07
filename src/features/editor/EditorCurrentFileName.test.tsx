import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useWriterEditorStateMock = vi.fn();

vi.mock("@/app/WriterAppContext", () => ({
  useWriterEditorState: () => useWriterEditorStateMock(),
}));

import { EditorCurrentFileName } from "@/features/editor/EditorCurrentFileName";

describe("EditorCurrentFileName", () => {
  beforeEach(() => {
    useWriterEditorStateMock.mockReset();
  });

  it("未打开章节时不显示文件名", () => {
    useWriterEditorStateMock.mockReturnValue({
      currentFilePath: null,
      editorContent: "",
      saveStatus: "idle",
      isDirty: false,
      isFileLoading: false,
    });

    const { container } = render(<EditorCurrentFileName />);

    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId("editor-current-file-name")).toBeNull();
  });

  it("仅显示当前文件名，并保留完整路径作为提示", () => {
    useWriterEditorStateMock.mockReturnValue({
      currentFilePath: "drafts/act-1/chapter-1.md",
      editorContent: "chapter 1",
      saveStatus: "saved",
      isDirty: false,
      isFileLoading: false,
    });

    render(<EditorCurrentFileName />);

    const currentFileName = screen.getByTestId("editor-current-file-name");

    expect(currentFileName.textContent).toBe("chapter-1.md");
    expect(currentFileName.getAttribute("title")).toBe("drafts/act-1/chapter-1.md");
  });
});
