import { useEffect, useId, useMemo, useState, type FormEvent } from "react"
import {
  BookOpen,
  ChevronRight,
  FileIcon,
  FilePlus2,
  FolderIcon,
  FolderOpen,
  LoaderCircle,
  RefreshCw,
} from "lucide-react"

import { useWriterAppActions, useWriterProjectState } from "@/app/WriterAppContext"
import { Badge } from "@/components/ui/badge"
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
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import {
  buildFileTree,
  getAncestorDirectoryPaths,
  getParentDirectoryPath,
  type FileTreeNode,
} from "@/features/fileManager/fileTree"
import { getBaseName } from "@/shared/utils/fileNames"

export function FileSidebar() {
  const projectState = useWriterProjectState()
  const { openProjectPicker, refreshFiles, selectFile, createFile } = useWriterAppActions()
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [nameValue, setNameValue] = useState("")
  const [isSubmittingName, setIsSubmittingName] = useState(false)
  const [expandedDirectories, setExpandedDirectories] = useState<Set<string>>(new Set())
  const nameInputId = useId()

  const busy = projectState.isProjectLoading || projectState.isFileLoading
  const actionsDisabled = busy || isSubmittingName
  const fileTree = useMemo(() => buildFileTree(projectState.files), [projectState.files])

  useEffect(() => {
    const ancestors = getAncestorDirectoryPaths(projectState.currentFilePath)
    if (ancestors.length > 0) {
      setExpandedDirectories((prev) => {
        const next = new Set(prev)
        for (const ancestor of ancestors) {
          next.add(ancestor)
        }
        return next
      })
    }
  }, [projectState.currentFilePath])

  function resetNameDialog() {
    setIsCreateDialogOpen(false)
    setNameValue("")
  }

  function openCreateDialog() {
    const parentDirectory = getParentDirectoryPath(projectState.currentFilePath)
    setIsCreateDialogOpen(true)
    setNameValue(parentDirectory ? `${parentDirectory}/新章节` : "新章节")
  }

  async function handleSubmitNameDialog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const nextName = nameValue.trim()
    if (!nextName) return

    setIsSubmittingName(true)
    try {
      await createFile(nextName)
      resetNameDialog()
    } finally {
      setIsSubmittingName(false)
    }
  }

  function handleDirectoryOpenChange(path: string, open: boolean) {
    setExpandedDirectories((prev) => {
      const next = new Set(prev)
      if (open) {
        next.add(path)
      } else {
        next.delete(path)
      }
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
          </SidebarMenuItem>
        )
      }

      return (
        <SidebarMenuSubItem key={node.path}>
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
      <Sidebar collapsible="none">
        <SidebarHeader className="gap-3 border-b pb-4">
          <div className="space-y-1">
            <p className="text-xs font-medium tracking-[0.24em] text-muted-foreground uppercase">
              Moss Writer
            </p>
            <p className="truncate text-2xl font-semibold tracking-tight">
              {projectState.projectPath
                ? getBaseName(projectState.projectPath)
                : "极简小说编辑器"}
            </p>
          </div>

          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <FolderOpen className="mt-0.5 size-4 shrink-0" />
            <p className="line-clamp-2 break-all">
              {projectState.projectPath ?? "选择一个本地文件夹作为小说项目"}
            </p>
          </div>

          <Badge className="w-fit" variant="secondary">
            {projectState.files.length} 个章节
          </Badge>

          <div className="grid gap-2">
            <Button
              className="justify-start"
              disabled={projectState.isProjectLoading || isSubmittingName}
              onClick={() => void openProjectPicker()}
              type="button"
            >
              {projectState.isProjectLoading ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <FolderOpen className="size-4" />
              )}
              {projectState.projectPath ? "切换项目" : "打开项目"}
            </Button>

            <div className="grid grid-cols-2 gap-2">
              <Button
                disabled={!projectState.projectPath || actionsDisabled}
                onClick={openCreateDialog}
                type="button"
                variant="outline"
              >
                <FilePlus2 className="size-4" />
                新建章节
              </Button>
              <Button
                disabled={!projectState.projectPath || actionsDisabled}
                onClick={() => void refreshFiles()}
                type="button"
                variant="outline"
              >
                <RefreshCw className={cn("size-4", busy && "animate-spin")} />
                刷新
              </Button>
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel className="flex items-center justify-between">
              章节结构
              <Badge variant="outline">{projectState.files.length}</Badge>
            </SidebarGroupLabel>
            <SidebarGroupContent>
              {!projectState.projectPath ? (
                <div className="flex flex-col gap-3 rounded-xl border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground mx-2">
                  <BookOpen className="size-5" />
                  <div className="space-y-1">
                    <p className="font-medium text-foreground">还没有打开项目</p>
                    <p>打开本地文件夹后，这里会按实际目录结构显示章节。</p>
                  </div>
                </div>
              ) : projectState.files.length === 0 ? (
                <div className="flex flex-col gap-3 rounded-xl border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground mx-2">
                  <FilePlus2 className="size-5" />
                  <div className="space-y-1">
                    <p className="font-medium text-foreground">当前项目还没有 Markdown 章节</p>
                    <p>先新建一个 `.md` 文件，创建后会自动在右侧打开。</p>
                  </div>
                </div>
              ) : (
                <SidebarMenu>
                  {fileTree.map((node) => renderTreeNode(node, 0))}
                </SidebarMenu>
              )}
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>

      <Dialog
        onOpenChange={(open) => {
          if (!open && !isSubmittingName) {
            resetNameDialog()
          }
        }}
        open={isCreateDialogOpen}
      >
        <DialogContent showCloseButton={!isSubmittingName}>
          <form className="space-y-4" onSubmit={handleSubmitNameDialog}>
            <DialogHeader>
              <DialogTitle>新建章节</DialogTitle>
              <DialogDescription>
                支持输入相对路径，例如 `卷一/第一章`。文件会在已存在目录中创建并自动打开。
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor={nameInputId}>
                章节路径
              </label>
              <Input
                autoFocus
                id={nameInputId}
                onChange={(event) => setNameValue(event.currentTarget.value)}
                placeholder="例如：卷一/第一章"
                value={nameValue}
              />
              <p className="text-xs text-muted-foreground">
                无需输入 `.md` 扩展名；父目录必须已存在。
              </p>
            </div>

            <DialogFooter>
              <Button
                disabled={isSubmittingName}
                onClick={resetNameDialog}
                type="button"
                variant="outline"
              >
                取消
              </Button>
              <Button disabled={isSubmittingName || !nameValue.trim()} type="submit">
                {isSubmittingName ? <LoaderCircle className="size-4 animate-spin" /> : null}
                创建章节
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
