import { useEffect, useId, useMemo, useState, type FormEvent } from "react"
import {
  BookOpen,
  ChevronRight,
  FileIcon,
  FilePlus2,
  FolderIcon,
  FolderOpen,
  FolderPlus,
  LoaderCircle,
  Plus,
  Settings2,
} from "lucide-react"

import { useWriterAppActions, useWriterProjectState } from "@/app/WriterAppContext"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import type { SettingsDialogTab } from "@/features/settings/SettingsDialog"
import {
  buildFileTree,
  getAncestorDirectoryPaths,
  type FileTreeNode,
} from "@/features/fileManager/fileTree"
import { getBaseName } from "@/shared/utils/fileNames"

type DialogMode = "file" | "directory"

interface DialogState {
  open: boolean
  mode: DialogMode
  initialPath: string
}

const CLOSED_DIALOG: DialogState = { open: false, mode: "file", initialPath: "" }

interface FileSidebarProps {
  onOpenSettings: (tab: SettingsDialogTab) => void
}

export function FileSidebar({ onOpenSettings }: FileSidebarProps) {
  const projectState = useWriterProjectState()
  const { openProjectPicker, selectFile, createFile, createDirectory } = useWriterAppActions()
  const [dialog, setDialog] = useState<DialogState>(CLOSED_DIALOG)
  const [nameValue, setNameValue] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [expandedDirectories, setExpandedDirectories] = useState<Set<string>>(new Set())
  const nameInputId = useId()

  const busy = projectState.isProjectLoading || projectState.isFileLoading
  const actionsDisabled = busy || isSubmitting
  const fileTree = useMemo(() => buildFileTree(projectState.files), [projectState.files])

  useEffect(() => {
    const ancestors = getAncestorDirectoryPaths(projectState.currentFilePath)
    if (ancestors.length > 0) {
      setExpandedDirectories((prev) => {
        const next = new Set(prev)
        for (const ancestor of ancestors) next.add(ancestor)
        return next
      })
    }
  }, [projectState.currentFilePath])

  // Sync input when dialog opens
  useEffect(() => {
    if (dialog.open) {
      setNameValue(dialog.initialPath)
    }
  }, [dialog.open, dialog.initialPath])

  function closeDialog() {
    setDialog(CLOSED_DIALOG)
    setNameValue("")
  }

  function openFileDialog(dirPath?: string) {
    setDialog({
      open: true,
      mode: "file",
      initialPath: dirPath ? `${dirPath}/新章节` : "新章节",
    })
  }

  function switchMode(mode: DialogMode) {
    const currentBase = nameValue.replace(/\/[^/]*$/, "") || ""
    if (mode === "file") {
      setNameValue(currentBase ? `${currentBase}/新章节` : "新章节")
    } else {
      setNameValue(currentBase ? `${currentBase}/新文件夹` : "新文件夹")
    }
    setDialog((prev) => ({ ...prev, mode }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = nameValue.trim()
    if (!value) return

    setIsSubmitting(true)
    try {
      if (dialog.mode === "file") {
        await createFile(value)
        closeDialog()
      } else {
        await createDirectory(value)
        // After creating directory, switch to file creation inside it
        setDialog({ open: true, mode: "file", initialPath: `${value}/新章节` })
        setNameValue(`${value}/新章节`)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  function handleDirectoryOpenChange(path: string, open: boolean) {
    setExpandedDirectories((prev) => {
      const next = new Set(prev)
      if (open) next.add(path)
      else next.delete(path)
      return next
    })
  }

  function renderTreeNode(node: FileTreeNode, depth = 0) {
    if (node.type === "directory") {
      const isOpen = expandedDirectories.has(node.path)

      if (depth === 0) {
        return (
          <SidebarMenuItem key={node.path}>
            <Collapsible
              className="group/tree-node w-full"
              onOpenChange={(open) => handleDirectoryOpenChange(node.path, open)}
              open={isOpen}
            >
              <CollapsibleTrigger asChild>
                <SidebarMenuButton>
                  <ChevronRight className="size-4 transition-transform group-data-[state=open]/tree-node:rotate-90" />
                  <FolderIcon className="size-4" />
                  <span className="truncate">{node.name}</span>
                </SidebarMenuButton>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarMenuSub>
                  {node.children.map((child) => renderTreeNode(child, depth + 1))}
                </SidebarMenuSub>
              </CollapsibleContent>
            </Collapsible>
            <SidebarMenuAction
              disabled={actionsDisabled}
              onClick={() => openFileDialog(node.path)}
              showOnHover
              title="在此目录下新建章节"
            >
              <Plus />
            </SidebarMenuAction>
          </SidebarMenuItem>
        )
      }

      return (
        <SidebarMenuSubItem key={node.path} className="group/sub-dir relative">
          <Collapsible
            className="group/tree-node w-full"
            onOpenChange={(open) => handleDirectoryOpenChange(node.path, open)}
            open={isOpen}
          >
            <CollapsibleTrigger asChild>
              <SidebarMenuSubButton>
                <ChevronRight className="size-3 transition-transform group-data-[state=open]/tree-node:rotate-90" />
                <FolderIcon className="size-3" />
                <span className="truncate">{node.name}</span>
              </SidebarMenuSubButton>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarMenuSub>
                {node.children.map((child) => renderTreeNode(child, depth + 1))}
              </SidebarMenuSub>
            </CollapsibleContent>
          </Collapsible>
          <button
            className="absolute right-1 top-1 flex aspect-square w-5 items-center justify-center rounded-md p-0 text-sidebar-foreground opacity-0 outline-hidden transition-opacity hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:opacity-100 focus-visible:ring-2 group-hover/sub-dir:opacity-100 disabled:pointer-events-none [&>svg]:size-4 [&>svg]:shrink-0"
            disabled={actionsDisabled}
            onClick={() => openFileDialog(node.path)}
            title="在此目录下新建章节"
            type="button"
          >
            <Plus />
          </button>
        </SidebarMenuSubItem>
      )
    }

    const isActive = node.path === projectState.currentFilePath

    if (depth === 0) {
      return (
        <SidebarMenuItem key={node.path}>
          <SidebarMenuButton
            disabled={actionsDisabled}
            isActive={isActive}
            onClick={() => void selectFile(node.path)}
          >
            <FileIcon className="size-4" />
            <span className="truncate">{node.name}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      )
    }

    return (
      <SidebarMenuSubItem key={node.path}>
        <SidebarMenuSubButton
          className={cn(isActive && "text-primary font-medium")}
          isActive={isActive}
          onClick={() => void selectFile(node.path)}
        >
          <FileIcon className="size-3" />
          <span className="truncate">{node.name}</span>
        </SidebarMenuSubButton>
      </SidebarMenuSubItem>
    )
  }

  return (
    <>
      <Sidebar collapsible="offcanvas">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                className="h-auto py-2"
                disabled={projectState.isProjectLoading || isSubmitting}
                onClick={() => void openProjectPicker()}
                size="lg"
                title={projectState.projectPath ? "切换项目" : "打开项目"}
              >
                {projectState.isProjectLoading ? (
                  <LoaderCircle className="size-5 shrink-0 animate-spin" />
                ) : (
                  <FolderOpen className="size-5 shrink-0" />
                )}
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-semibold">
                    {projectState.projectPath
                      ? getBaseName(projectState.projectPath)
                      : "打开项目"}
                  </span>
                  {!projectState.projectPath && (
                    <span className="text-xs font-normal text-muted-foreground">
                      选择本地文件夹
                    </span>
                  )}
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>章节结构</SidebarGroupLabel>
            <SidebarGroupAction
              disabled={!projectState.projectPath || actionsDisabled}
              onClick={() => openFileDialog()}
              title="新建章节"
            >
              <Plus />
            </SidebarGroupAction>
            <SidebarGroupContent>
              {!projectState.projectPath ? (
                <div className="flex flex-col gap-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground mx-2">
                  <BookOpen className="size-4" />
                  <p>打开本地文件夹后，这里会按目录结构显示章节。</p>
                </div>
              ) : projectState.files.length === 0 ? (
                <div className="flex flex-col gap-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground mx-2">
                  <FilePlus2 className="size-4" />
                  <p>
                    暂无章节，点击右上角 <strong>+</strong> 新建。
                  </p>
                </div>
              ) : (
                <SidebarMenu>{fileTree.map((node) => renderTreeNode(node, 0))}</SidebarMenu>
              )}
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <div className="mt-auto border-t p-2">
          <Button
            className="w-full justify-start"
            disabled={actionsDisabled}
            onClick={() => onOpenSettings("general")}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Settings2 className="size-4" />
            设置
          </Button>
        </div>
      </Sidebar>

      <Dialog
        onOpenChange={(open) => {
          if (!open && !isSubmitting) closeDialog()
        }}
        open={dialog.open}
      >
        <DialogContent showCloseButton={!isSubmitting}>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>新建</DialogTitle>
              <DialogDescription>
                {dialog.mode === "file"
                  ? "创建 Markdown 章节文件。路径中的父目录如不存在会自动创建。"
                  : "创建子文件夹，完成后可在其中新建章节。"}
              </DialogDescription>
            </DialogHeader>

            <Tabs
              onValueChange={(v) => switchMode(v as DialogMode)}
              value={dialog.mode}
            >
              <TabsList className="w-full">
                <TabsTrigger className="flex-1" value="file">
                  <FilePlus2 className="size-4" />
                  章节文件
                </TabsTrigger>
                <TabsTrigger className="flex-1" value="directory">
                  <FolderPlus className="size-4" />
                  文件夹
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor={nameInputId}>
                {dialog.mode === "file" ? "章节路径" : "文件夹路径"}
              </label>
              <Input
                autoFocus
                id={nameInputId}
                key={dialog.mode}
                onChange={(event) => setNameValue(event.currentTarget.value)}
                placeholder={dialog.mode === "file" ? "例如：卷一/第一章" : "例如：卷一"}
                value={nameValue}
              />
              {dialog.mode === "file" && (
                <p className="text-xs text-muted-foreground">无需输入 `.md` 扩展名。</p>
              )}
            </div>

            <DialogFooter>
              <Button
                disabled={isSubmitting}
                onClick={closeDialog}
                type="button"
                variant="outline"
              >
                取消
              </Button>
              <Button disabled={isSubmitting || !nameValue.trim()} type="submit">
                {isSubmitting ? <LoaderCircle className="size-4 animate-spin" /> : null}
                {dialog.mode === "file" ? "创建章节" : "创建并继续"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
