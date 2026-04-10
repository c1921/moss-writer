import { render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { EditorView } from "@codemirror/view"

import { CodeMirrorEditor } from "@/features/editor/CodeMirrorEditor"

describe("CodeMirrorEditor", () => {
  it("支持输入、切换行号显示和外部内容同步", async () => {
    const onChangeMock = vi.fn()
    const { container, rerender } = render(
      <CodeMirrorEditor
        ariaLabel="正文编辑区"
        dataTestId="editor-input"
        fontSizePx={16}
        lineHeight="2"
        onChange={onChangeMock}
        placeholder="开始写作..."
        showLineNumbers
        value=""
      />
    )

    const editor = screen.getByTestId("editor-input") as HTMLElement
    const view = EditorView.findFromDOM(editor)

    expect(view).not.toBeNull()

    view?.dispatch({
      changes: {
        from: 0,
        insert: "新的内容",
      },
    })

    await waitFor(() =>
      expect(onChangeMock).toHaveBeenLastCalledWith("新的内容")
    )
    expect(container.querySelector(".cm-lineNumbers")).not.toBeNull()

    rerender(
      <CodeMirrorEditor
        ariaLabel="正文编辑区"
        dataTestId="editor-input"
        fontSizePx={16}
        lineHeight="2"
        onChange={onChangeMock}
        placeholder="开始写作..."
        showLineNumbers={false}
        value=""
      />
    )

    await waitFor(() =>
      expect(container.querySelector(".cm-lineNumbers")).toBeNull()
    )

    rerender(
      <CodeMirrorEditor
        ariaLabel="正文编辑区"
        dataTestId="editor-input"
        fontSizePx={16}
        lineHeight="2"
        onChange={onChangeMock}
        placeholder="开始写作..."
        showLineNumbers={false}
        value={"第一行\n第二行"}
      />
    )

    await waitFor(() => expect(screen.getByText("第一行")).not.toBeNull())
    expect(screen.getByText("第二行")).not.toBeNull()
  })
})
