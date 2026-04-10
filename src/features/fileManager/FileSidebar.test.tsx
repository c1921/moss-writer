import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/app/WriterAppContext", () => ({
  useWriterProjectState: vi.fn(),
  useWriterAppActions: vi.fn(),
}))

import * as writerAppContext from "@/app/WriterAppContext"
import { SidebarProvider } from "@/components/ui/sidebar"
import { FileSidebar } from "@/features/fileManager/FileSidebar"

interface MockProjectState {
  projectPath: string | null
  files: { name: string; path: string }[]
  directories: { name: string; path: string }[]
  currentFilePath: string | null
  isProjectLoading: boolean
  isFileLoading: boolean
}

describe("FileSidebar", () => {
  const useWriterProjectStateMock = vi.mocked(writerAppContext.useWriterProjectState)
  const useWriterAppActionsMock = vi.mocked(writerAppContext.useWriterAppActions)
  const openProjectPickerMock = vi.fn()
  const openProjectPathMock = vi.fn()
  const selectFileMock = vi.fn()
  const createFileMock = vi.fn(async () => {})
  const createDirectoryMock = vi.fn(async () => {})
  const renameFileMock = vi.fn()
  const deleteFileMock = vi.fn()
  const updateEditorContentMock = vi.fn()
  const flushPendingSaveMock = vi.fn()
  const refreshProjectFilesMock = vi.fn()
  const clearErrorMock = vi.fn()

  function createProjectState(overrides: Partial<MockProjectState> = {}): MockProjectState {
    return {
      projectPath: "/project",
      files: [{ name: "first.md", path: "first.md" }],
      directories: [],
      currentFilePath: "first.md",
      isProjectLoading: false,
      isFileLoading: false,
      ...overrides,
    }
  }

  function renderSidebar() {
    return render(
      <SidebarProvider>
        <FileSidebar onOpenSettings={vi.fn()} />
      </SidebarProvider>,
    )
  }

  beforeEach(() => {
    vi.clearAllMocks()

    useWriterProjectStateMock.mockReturnValue(createProjectState())
    useWriterAppActionsMock.mockReturnValue({
      openProjectPicker: openProjectPickerMock,
      openProjectPath: openProjectPathMock,
      selectFile: selectFileMock,
      createFile: createFileMock,
      createDirectory: createDirectoryMock,
      renameFile: renameFileMock,
      deleteFile: deleteFileMock,
      updateEditorContent: updateEditorContentMock,
      flushPendingSave: flushPendingSaveMock,
      refreshProjectFiles: refreshProjectFilesMock,
      clearError: clearErrorMock,
    })
  })

  it("在底部显示可用的设置按钮而不是刷新按钮", async () => {
    const user = userEvent.setup()
    const onOpenSettings = vi.fn()

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

  it("根目录新建文件夹时预填默认名称并直接创建目录", async () => {
    const user = userEvent.setup()

    useWriterProjectStateMock.mockReturnValue(
      createProjectState({
        files: [],
        directories: [{ name: "未命名", path: "未命名" }],
        currentFilePath: null,
      }),
    )

    renderSidebar()

    await user.click(screen.getByTitle("新建章节"))
    await user.click(screen.getByRole("tab", { name: "文件夹" }))

    const input = screen.getByLabelText("文件夹名称") as HTMLInputElement
    expect(input.value).toBe("未命名(2)")

    await user.click(screen.getByRole("button", { name: "创建文件夹" }))

    await waitFor(() => {
      expect(createDirectoryMock).toHaveBeenCalledWith("未命名(2)")
      expect(screen.queryByRole("dialog")).toBeNull()
    })
    expect(createFileMock).not.toHaveBeenCalled()
  })

  it("目录按钮下新建文件夹时会基于该目录拼接相对路径", async () => {
    const user = userEvent.setup()

    useWriterProjectStateMock.mockReturnValue(
      createProjectState({
        files: [{ name: "现有.md", path: "卷一/现有.md" }],
        directories: [{ name: "卷一", path: "卷一" }],
        currentFilePath: "卷一/现有.md",
      }),
    )

    renderSidebar()

    const volumeOneItem = screen.getByText("卷一").closest("li")
    expect(volumeOneItem).not.toBeNull()

    const volumeOneCreateButton = volumeOneItem?.querySelector(
      '[data-sidebar="menu-action"][title="在此目录下新建章节"]',
    ) as HTMLButtonElement | null
    expect(volumeOneCreateButton).not.toBeNull()

    await user.click(volumeOneCreateButton!)
    const fileInput = screen.getByLabelText("章节名称") as HTMLInputElement
    expect(fileInput.value).toBe("未命名")

    await user.click(screen.getByRole("tab", { name: "文件夹" }))

    const input = screen.getByLabelText("文件夹名称") as HTMLInputElement
    await user.clear(input)
    await user.type(input, "子目录")
    await user.click(screen.getByRole("button", { name: "创建文件夹" }))

    await waitFor(() => {
      expect(createDirectoryMock).toHaveBeenCalledWith("卷一/子目录")
      expect(screen.queryByRole("dialog")).toBeNull()
    })
    expect(createFileMock).not.toHaveBeenCalled()
  })

  it("目录按钮下新建章节时会基于该目录拼接相对路径", async () => {
    const user = userEvent.setup()

    useWriterProjectStateMock.mockReturnValue(
      createProjectState({
        files: [{ name: "现有.md", path: "卷一/现有.md" }],
        directories: [{ name: "卷一", path: "卷一" }],
        currentFilePath: "卷一/现有.md",
      }),
    )

    renderSidebar()

    await user.click(screen.getByTitle("在此目录下新建章节"))

    const input = screen.getByLabelText("章节名称") as HTMLInputElement
    expect(input.value).toBe("未命名")

    await user.clear(input)
    await user.type(input, "子章节")
    await user.click(screen.getByRole("button", { name: "创建章节" }))

    await waitFor(() => {
      expect(createFileMock).toHaveBeenCalledWith("卷一/子章节")
      expect(screen.queryByRole("dialog")).toBeNull()
    })
    expect(createDirectoryMock).not.toHaveBeenCalled()
  })

  it("文件模式允许输入多级相对路径并挂到当前父目录下", async () => {
    const user = userEvent.setup()

    useWriterProjectStateMock.mockReturnValue(
      createProjectState({
        files: [{ name: "现有.md", path: "卷一/现有.md" }],
        directories: [{ name: "卷一", path: "卷一" }],
        currentFilePath: "卷一/现有.md",
      }),
    )

    renderSidebar()

    await user.click(screen.getByTitle("在此目录下新建章节"))

    const input = screen.getByLabelText("章节名称")
    await user.clear(input)
    await user.type(input, "人物/主角")
    await user.click(screen.getByRole("button", { name: "创建章节" }))

    await waitFor(() => {
      expect(createFileMock).toHaveBeenCalledWith("卷一/人物/主角")
    })
    expect(createDirectoryMock).not.toHaveBeenCalled()
  })

  it("文件夹模式允许输入多级相对路径并挂到当前父目录下", async () => {
    const user = userEvent.setup()

    useWriterProjectStateMock.mockReturnValue(
      createProjectState({
        files: [{ name: "现有.md", path: "卷一/现有.md" }],
        directories: [{ name: "卷一", path: "卷一" }],
        currentFilePath: "卷一/现有.md",
      }),
    )

    renderSidebar()

    await user.click(screen.getByTitle("在此目录下新建章节"))
    await user.click(screen.getByRole("tab", { name: "文件夹" }))

    const input = screen.getByLabelText("文件夹名称")
    await user.clear(input)
    await user.type(input, "人物/主角")
    await user.click(screen.getByRole("button", { name: "创建文件夹" }))

    await waitFor(() => {
      expect(createDirectoryMock).toHaveBeenCalledWith("卷一/人物/主角")
    })
    expect(createFileMock).not.toHaveBeenCalled()
  })

  it("空文件夹也会显示在章节结构里", () => {
    useWriterProjectStateMock.mockReturnValue(
      createProjectState({
        files: [],
        directories: [{ name: "空目录", path: "空目录" }],
        currentFilePath: null,
      }),
    )

    renderSidebar()

    expect(screen.getByText("空目录")).not.toBeNull()
    expect(screen.queryByText("暂无章节，点击右上角")).toBeNull()
  })

  it("根目录新建章节时预填未命名并自动避让同名文件", async () => {
    const user = userEvent.setup()

    useWriterProjectStateMock.mockReturnValue(
      createProjectState({
        files: [
          { name: "未命名.md", path: "未命名.md" },
          { name: "未命名(2).md", path: "未命名(2).md" },
        ],
        currentFilePath: "未命名.md",
      }),
    )

    renderSidebar()

    await user.click(screen.getByTitle("新建章节"))

    const input = screen.getByLabelText("章节名称") as HTMLInputElement
    expect(input.value).toBe("未命名(3)")
  })

  it("切换标签时按当前目录分别计算文件和文件夹默认名", async () => {
    const user = userEvent.setup()

    useWriterProjectStateMock.mockReturnValue(
      createProjectState({
        files: [
          { name: "未命名.md", path: "卷一/未命名.md" },
          { name: "未命名.md", path: "卷一/子目录/未命名.md" },
        ],
        directories: [
          { name: "卷一", path: "卷一" },
          { name: "未命名", path: "卷一/未命名" },
          { name: "未命名(2)", path: "卷一/未命名(2)" },
          { name: "子目录", path: "卷一/子目录" },
          { name: "未命名", path: "卷一/子目录/未命名" },
        ],
        currentFilePath: "卷一/未命名.md",
      }),
    )

    renderSidebar()

    const volumeOneItem = screen.getByText("卷一").closest("li")
    expect(volumeOneItem).not.toBeNull()

    const volumeOneCreateButton = volumeOneItem?.querySelector(
      '[data-sidebar="menu-action"][title="在此目录下新建章节"]',
    ) as HTMLButtonElement | null
    expect(volumeOneCreateButton).not.toBeNull()

    await user.click(volumeOneCreateButton!)

    const fileInput = screen.getByLabelText("章节名称") as HTMLInputElement
    expect(fileInput.value).toBe("未命名(2)")

    await user.click(screen.getByRole("tab", { name: "文件夹" }))
    const directoryInput = screen.getByLabelText("文件夹名称") as HTMLInputElement
    expect(directoryInput.value).toBe("未命名(3)")
  })
})
