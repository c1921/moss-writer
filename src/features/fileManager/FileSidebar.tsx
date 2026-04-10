import { useEffect, useId, useMemo, useState, type FormEvent, type ReactNode } from "react"
import {
  BookOpen,
  ChevronRight,
  FileIcon,
  FilePlus2,
  FolderIcon,
  FolderOpen,
  FolderPlus,
  LoaderCircle,
  Pencil,
  Plus,
  Settings2,
  Trash2,
} from "lucide-react"

import { useWriterAppActions, useWriterProjectState } from "@/app/WriterAppContext"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
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
import { getBaseName, stripMarkdownExtension } from "@/shared/utils/fileNames"

type DialogMode = "file" | "directory"

interface CreateDialogState {
  open: boolean
  mode: DialogMode
  parentPath: string
}

interface TreeTarget {
  type: DialogMode
  path: string
  name: string
}

const CLOSED_CREATE_DIALOG: CreateDialogState = { open: false, mode: "file", parentPath: "" }
const DEFAULT_UNTITLED_NAME = "未命名"
const RENAME_PATH_SEPARATOR_PATTERN = /[\\/]/

interface FileSidebarProps {
  onOpenSettings: (tab: SettingsDialogTab) => void
}

function getParentPath(path: string) {
  const segments = path.split("/").filter(Boolean)
  if (segments.length <= 1) {
    return ""
  }

  return segments.slice(0, -1).join("/")
}

function joinPath(parentPath: string, name: string) {
  return parentPath ? `${parentPath}/${name}` : name
}

function getRenameInitialValue(target: TreeTarget) {
  return target.type === "file" ? stripMarkdownExtension(getBaseName(target.path)) : target.name
}

export function FileSidebar({ onOpenSettings }: FileSidebarProps) {
  const projectState = useWriterProjectState()
  const {
    openProjectPicker,
    selectFile,
    createFile,
    createDirectory,
    renameFile,
    deleteFile,
    renameDirectory,
    deleteDirectory,
  } = useWriterAppActions()
  const [createDialog, setCreateDialog] = useState<CreateDialogState>(CLOSED_CREATE_DIALOG)
  const [nameValue, setNameValue] = useState("")
  const [renameTarget, setRenameTarget] = useState<TreeTarget | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const [deleteTarget, setDeleteTarget] = useState<TreeTarget | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [expandedDirectories, setExpandedDirectories] = useState<Set<string>>(new Set())
  const nameInputId = useId()
  const renameInputId = useId()

  const busy = projectState.isProjectLoading || projectState.isFileLoading
  const actionsDisabled = busy || isSubmitting
  const fileTree = useMemo(
    () => buildFileTree(projectState.files, projectState.directories),
    [projectState.directories, projectState.files],
  )
  const renameHasPathSeparator = RENAME_PATH_SEPARATOR_PATTERN.test(renameValue.trim())

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

  function closeCreateDialog() {
    setCreateDialog(CLOSED_CREATE_DIALOG)
    setNameValue("")
  }

  function closeRenameDialog() {
    setRenameTarget(null)
    setRenameValue("")
  }

  function closeDeleteDialog() {
    setDeleteTarget(null)
  }

  function getDefaultName(mode: DialogMode, parentPath: string) {
    const siblings =
      mode === "file"
        ? projectState.files
            .filter((file) => getParentPath(file.path) === parentPath)
            .map((file) => stripMarkdownExtension(getBaseName(file.path)))
        : projectState.directories
            .filter((directory) => getParentPath(directory.path) === parentPath)
            .map((directory) => getBaseName(directory.path))

    const usedNames = new Set(siblings)
    if (!usedNames.has(DEFAULT_UNTITLED_NAME)) {
      return DEFAULT_UNTITLED_NAME
    }

    let suffix = 2
    while (usedNames.has(`${DEFAULT_UNTITLED_NAME}(${suffix})`)) {
      suffix += 1
    }

    return `${DEFAULT_UNTITLED_NAME}(${suffix})`
  }

  function openFileDialog(dirPath?: string) {
    const parentPath = dirPath ?? ""
    setCreateDialog({
      open: true,
      mode: "file",
      parentPath,
    })
    setNameValue(getDefaultName("file", parentPath))
  }

  function switchMode(mode: DialogMode) {
    const parentPath = createDialog.parentPath
    setCreateDialog((prev) => ({ ...prev, mode }))
    setNameValue(getDefaultName(mode, parentPath))
  }

  function openRenameDialog(target: TreeTarget) {
    setRenameTarget(target)
    setRenameValue(getRenameInitialValue(target))
  }

  function openDeleteDialog(target: TreeTarget) {
    setDeleteTarget(target)
  }

  async function handleCreateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = nameValue.trim()
    if (!value) return

    setIsSubmitting(true)
    try {
      const path = joinPath(createDialog.parentPath, value)
      if (createDialog.mode === "file") {
        await createFile(path)
      } else {
        await createDirectory(path)
      }
      closeCreateDialog()
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleRenameSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!renameTarget) return

    const value = renameValue.trim()
    if (!value || renameHasPathSeparator) return

    setIsSubmitting(true)
    try {
      if (renameTarget.type === "file") {
        await renameFile(renameTarget.path, joinPath(getParentPath(renameTarget.path), value))
      } else {
        await renameDirectory(renameTarget.path, value)
      }
      closeRenameDialog()
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return

    setIsSubmitting(true)
    try {
      if (deleteTarget.type === "file") {
        await deleteFile(deleteTarget.path)
      } else {
        await deleteDirectory(deleteTarget.path)
      }
      closeDeleteDialog()
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

  function renderNodeMenu(target: TreeTarget, children: ReactNode) {
    return (
      <ContextMenu>
        <ContextMenuTrigger render={<div className="contents" />}>{children}</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem
            disabled={actionsDisabled}
            onClick={() => openRenameDialog(target)}
          >
            <Pencil className="size-4" />
            重命名
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            className="text-destructive data-[highlighted]:bg-destructive/10 data-[highlighted]:text-destructive"
            disabled={actionsDisabled}
            onClick={() => openDeleteDialog(target)}
          >
            <Trash2 className="size-4" />
            删除
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    )
  }

  function renderTreeNode(node: FileTreeNode, depth = 0): ReactNode {
    if (node.type === "directory") {
      const isOpen = expandedDirectories.has(node.path)
      const target: TreeTarget = {
        type: "directory",
        path: node.path,
        name: node.name,
      }

      if (depth === 0) {
        return (
          <SidebarMenuItem key={node.path}>
            {renderNodeMenu(
              target,
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
              </Collapsible>,
            )}
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
          {renderNodeMenu(
            target,
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
            </Collapsible>,
          )}
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
    const target: TreeTarget = {
      type: "file",
      path: node.path,
      name: node.name,
    }

    if (depth === 0) {
      return (
        <SidebarMenuItem key={node.path}>
          {renderNodeMenu(
            target,
            <SidebarMenuButton
              disabled={actionsDisabled}
              isActive={isActive}
              onClick={() => void selectFile(node.path)}
            >
              <FileIcon className="size-4" />
              <span className="truncate">{node.name}</span>
            </SidebarMenuButton>,
          )}
        </SidebarMenuItem>
      )
    }

    return (
      <SidebarMenuSubItem key={node.path}>
        {renderNodeMenu(
          target,
          <SidebarMenuSubButton
            className={cn(isActive && "text-primary font-medium")}
            isActive={isActive}
            onClick={() => void selectFile(node.path)}
          >
            <FileIcon className="size-3" />
            <span className="truncate">{node.name}</span>
          </SidebarMenuSubButton>,
        )}
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
                <div className="mx-2 flex flex-col gap-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  <BookOpen className="size-4" />
                  <p>打开本地文件夹后，这里会按目录结构显示章节。</p>
                </div>
              ) : projectState.files.length === 0 && projectState.directories.length === 0 ? (
                <div className="mx-2 flex flex-col gap-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
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
            onClick={() => onOpenSettings("editor")}
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
          if (!open && !isSubmitting) closeCreateDialog()
        }}
        open={createDialog.open}
      >
        <DialogContent showCloseButton={!isSubmitting}>
          <form className="space-y-4" onSubmit={handleCreateSubmit}>
            <DialogHeader>
              <DialogTitle>新建</DialogTitle>
              <DialogDescription>
                {createDialog.mode === "file"
                  ? `在${createDialog.parentPath || "项目根目录"}下创建 Markdown 章节文件。输入名称即可，也支持相对路径。`
                  : `在${createDialog.parentPath || "项目根目录"}下创建子文件夹。输入名称即可，也支持相对路径。`}
              </DialogDescription>
            </DialogHeader>

            <Tabs
              onValueChange={(v) => switchMode(v as DialogMode)}
              value={createDialog.mode}
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
                {createDialog.mode === "file" ? "章节名称" : "文件夹名称"}
              </label>
              <Input
                autoFocus
                id={nameInputId}
                key={createDialog.mode}
                onChange={(event) => setNameValue(event.currentTarget.value)}
                placeholder={createDialog.mode === "file" ? "例如：第一章" : "例如：人物/主角"}
                value={nameValue}
              />
              {createDialog.mode === "file" && (
                <p className="text-xs text-muted-foreground">无需输入 `.md` 扩展名。</p>
              )}
            </div>

            <DialogFooter>
              <Button
                disabled={isSubmitting}
                onClick={closeCreateDialog}
                type="button"
                variant="outline"
              >
                取消
              </Button>
              <Button disabled={isSubmitting || !nameValue.trim()} type="submit">
                {isSubmitting ? <LoaderCircle className="size-4 animate-spin" /> : null}
                {createDialog.mode === "file" ? "创建章节" : "创建文件夹"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        onOpenChange={(open) => {
          if (!open && !isSubmitting) closeRenameDialog()
        }}
        open={renameTarget !== null}
      >
        <DialogContent showCloseButton={!isSubmitting}>
          <form className="space-y-4" onSubmit={handleRenameSubmit}>
            <DialogHeader>
              <DialogTitle>重命名</DialogTitle>
              <DialogDescription>
                {renameTarget?.type === "file"
                  ? `重命名 ${renameTarget.path}。只修改当前章节名称，不移动目录。`
                  : `重命名 ${renameTarget?.path ?? ""}。只修改当前文件夹名称，不移动层级。`}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor={renameInputId}>
                {renameTarget?.type === "file" ? "章节名称" : "文件夹名称"}
              </label>
              <Input
                autoFocus
                id={renameInputId}
                onChange={(event) => setRenameValue(event.currentTarget.value)}
                placeholder={renameTarget?.type === "file" ? "例如：第一章" : "例如：卷一"}
                value={renameValue}
              />
              {renameTarget?.type === "file" ? (
                <p className="text-xs text-muted-foreground">无需输入 `.md` 扩展名。</p>
              ) : null}
              {renameHasPathSeparator ? (
                <p className="text-xs text-destructive">重命名只允许修改当前层级名称，不能包含 `/` 或 `\\`。</p>
              ) : null}
            </div>

            <DialogFooter>
              <Button
                disabled={isSubmitting}
                onClick={closeRenameDialog}
                type="button"
                variant="outline"
              >
                取消
              </Button>
              <Button
                disabled={isSubmitting || !renameValue.trim() || renameHasPathSeparator}
                type="submit"
              >
                {isSubmitting ? <LoaderCircle className="size-4 animate-spin" /> : null}
                确认重命名
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        onOpenChange={(open) => {
          if (!open && !isSubmitting) closeDeleteDialog()
        }}
        open={deleteTarget !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteTarget?.type === "file" ? "删除章节" : "删除文件夹"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.type === "file"
                ? `将删除 ${deleteTarget.path}，此操作不可恢复。`
                : `将递归删除 ${deleteTarget?.path ?? ""} 及其下所有子文件夹和章节，此操作不可恢复。`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={isSubmitting}
              onClick={() => void handleDeleteConfirm()}
              variant="destructive"
            >
              {isSubmitting ? <LoaderCircle className="size-4 animate-spin" /> : null}
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
