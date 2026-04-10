import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/app/WriterAppContext", () => ({
  useWriterProjectState: vi.fn(),
  useWriterAppActions: vi.fn(),
}))

import * as writerAppContext from "@/app/WriterAppContext"
import { SidebarProvider } from "@/components/ui/sidebar"
import { FileSidebar } from "@/features/fileManager/FileSidebar"

describe("FileSidebar", () => {
  const useWriterProjectStateMock = vi.mocked(writerAppContext.useWriterProjectState)
  const useWriterAppActionsMock = vi.mocked(writerAppContext.useWriterAppActions)

  it("在底部显示可用的设置按钮而不是刷新按钮", async () => {
    const user = userEvent.setup()
    const onOpenSettings = vi.fn()

    useWriterProjectStateMock.mockReturnValue({
      projectPath: "/project",
      files: [{ name: "first.md", path: "first.md" }],
      currentFilePath: "first.md",
      isProjectLoading: false,
      isFileLoading: false,
    })
    useWriterAppActionsMock.mockReturnValue({
      openProjectPicker: vi.fn(),
      openProjectPath: vi.fn(),
      selectFile: vi.fn(),
      createFile: vi.fn(),
      createDirectory: vi.fn(),
      renameFile: vi.fn(),
      deleteFile: vi.fn(),
      updateEditorContent: vi.fn(),
      flushPendingSave: vi.fn(),
      refreshProjectFiles: vi.fn(),
      clearError: vi.fn(),
    })

    render(
      <SidebarProvider>
        <FileSidebar onOpenSettings={onOpenSettings} />
      </SidebarProvider>,
    )

    expect(screen.queryByRole("button", { name: "刷新" })).toBeNull()

    const settingsButton = screen.getByRole("button", { name: "设置" }) as HTMLButtonElement
    expect(settingsButton.disabled).toBe(false)

    await user.click(settingsButton)
    expect(onOpenSettings).toHaveBeenCalledTimes(1)
    expect(onOpenSettings).toHaveBeenCalledWith("editor")
  })
})
