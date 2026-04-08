import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useWriterEditorStateMock = vi.fn();

vi.mock("@/app/WriterAppContext", () => ({
  useWriterEditorState: () => useWriterEditorStateMock(),
}));

import { EditorSaveStatusBadge } from "@/features/editor/EditorSaveStatusBadge";

describe("EditorSaveStatusBadge", () => {
  beforeEach(() => {
    useWriterEditorStateMock.mockReset();
  });

  it("未打开章节时不显示状态标签", () => {
    useWriterEditorStateMock.mockReturnValue({
      currentFilePath: null,
      editorContent: "",
      saveStatus: "idle",
      isDirty: false,
      isFileLoading: false,
    });

    const { container } = render(<EditorSaveStatusBadge />);

    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId("editor-save-status")).toBeNull();
  });

  it("打开章节后显示当前保存状态", () => {
    useWriterEditorStateMock.mockReturnValue({
      currentFilePath: "drafts/chapter-1.md",
      editorContent: "chapter 1",
      saveStatus: "saved",
      isDirty: false,
      isFileLoading: false,
    });

    render(<EditorSaveStatusBadge />);

    expect(screen.getByTestId("editor-save-status").textContent).toBe("已保存");
  });

  it("小窗模式需要状态位时，未打开章节也显示不可用状态", () => {
    useWriterEditorStateMock.mockReturnValue({
      currentFilePath: null,
      editorContent: "",
      saveStatus: "idle",
      isDirty: false,
      isFileLoading: false,
    });

    render(<EditorSaveStatusBadge showUnavailable />);

    expect(screen.getByTestId("editor-save-status").textContent).toBe("未打开");
  });
});
