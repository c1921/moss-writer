import { useEffect, useId, useState, type FormEvent } from "react"
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

import { useWriterApp } from "@/app/WriterAppContext"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import {
  buildFileTree,
  getAncestorDirectoryPaths,
  getParentDirectoryPath,
  type FileTreeNode,
} from "@/features/fileManager/fileTree"
import { getBaseName } from "@/shared/utils/fileNames"

export function FileSidebar() {
  const { state, openProjectPicker, refreshFiles, selectFile, createFile } = useWriterApp()
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [nameValue, setNameValue] = useState("")
  const [isSubmittingName, setIsSubmittingName] = useState(false)
  const [expandedDirectories, setExpandedDirectories] = useState<Set<string>>(new Set())
  const nameInputId = useId()

  const busy = state.isProjectLoading || state.isFileLoading
  const actionsDisabled = busy || isSubmittingName
  const fileTree = buildFileTree(state.files)

  useEffect(() => {
    const ancestors = getAncestorDirectoryPaths(state.currentFilePath)
    if (ancestors.length > 0) {
      setExpandedDirectories((prev) => {
        const next = new Set(prev)
        for (const ancestor of ancestors) {
          next.add(ancestor)
        }
        return next
      })
    }
  }, [state.currentFilePath])

  function resetNameDialog() {
    setIsCreateDialogOpen(false)
    setNameValue("")
  }

  function openCreateDialog() {
    const parentDirectory = getParentDirectoryPath(state.currentFilePath)

    setIsCreateDialogOpen(true)
    setNameValue(parentDirectory ? `${parentDirectory}/新章节` : "新章节")
  }

  async function handleSubmitNameDialog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const nextName = nameValue.trim()
    if (!nextName) {
      return
    }

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

  function renderTreeNode(node: FileTreeNode) {
    if (node.type === "directory") {
      const isOpen = expandedDirectories.has(node.path)

      return (
        <Collapsible
          className="group/tree-node"
          key={node.path}
          onOpenChange={(open) => handleDirectoryOpenChange(node.path, open)}
          open={isOpen}
        >
          <CollapsibleTrigger asChild>
            <Button
              className="w-full justify-start transition-none hover:bg-accent hover:text-accent-foreground"
              size="sm"
              type="button"
              variant="ghost"
            >
              <ChevronRight className="size-4 transition-transform group-data-[state=open]/tree-node:rotate-90" />
              <FolderIcon className="size-4" />
              <span className="truncate">{node.name}</span>
            </Button>
          </CollapsibleTrigger>

          <CollapsibleContent className="mt-1 ml-5">
            <div className="flex flex-col gap-1">{node.children.map(renderTreeNode)}</div>
          </CollapsibleContent>
        </Collapsible>
      )
    }

    const isActive = node.path === state.currentFilePath

    return (
      <Button
        className={cn("w-full justify-start gap-2", isActive ? "text-primary" : "text-foreground")}
        disabled={actionsDisabled}
        key={node.path}
        onClick={() => void selectFile(node.path)}
        size="sm"
        type="button"
        variant="link"
      >
        <FileIcon className="size-4" />
        <span className={cn("truncate", isActive && "font-medium")}>{node.name}</span>
      </Button>
    )
  }

  return (
    <>
      <aside className="flex min-h-[22rem] min-w-0">
        <Card className="flex min-h-full flex-1 border-0 shadow-sm">
          <CardHeader className="gap-3 border-b">
            <div className="space-y-1">
              <p className="text-xs font-medium tracking-[0.24em] text-muted-foreground uppercase">
                Moss Writer
              </p>
              <CardTitle className="truncate text-2xl font-semibold tracking-tight">
                {state.projectPath ? getBaseName(state.projectPath) : "极简小说编辑器"}
              </CardTitle>
            </div>

            <div className="flex items-start gap-2 text-sm text-muted-foreground">
              <FolderOpen className="mt-0.5 size-4 shrink-0" />
              <p className="line-clamp-2 break-all">
                {state.projectPath ?? "选择一个本地文件夹作为小说项目"}
              </p>
            </div>

            <Badge className="w-fit" variant="secondary">
              {state.files.length} 个章节
            </Badge>
          </CardHeader>

          <CardContent className="flex min-h-0 flex-1 flex-col gap-4">
            <div className="grid gap-2 pt-0">
              <Button
                className="justify-start"
                disabled={state.isProjectLoading || isSubmittingName}
                onClick={() => void openProjectPicker()}
                type="button"
              >
                {state.isProjectLoading ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <FolderOpen className="size-4" />
                )}
                {state.projectPath ? "切换项目" : "打开项目"}
              </Button>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  disabled={!state.projectPath || actionsDisabled}
                  onClick={openCreateDialog}
                  type="button"
                  variant="outline"
                >
                  <FilePlus2 className="size-4" />
                  新建章节
                </Button>
                <Button
                  disabled={!state.projectPath || actionsDisabled}
                  onClick={() => void refreshFiles()}
                  type="button"
                  variant="outline"
                >
                  <RefreshCw className={cn("size-4", busy && "animate-spin")} />
                  刷新
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">章节结构</p>
                <p className="text-xs text-muted-foreground">
                  按项目实际目录结构递归显示 `.md` 文件
                </p>
              </div>
              <Badge variant="outline">{state.files.length}</Badge>
            </div>

            {!state.projectPath ? (
              <div className="flex flex-1 items-center">
                <div className="flex w-full flex-col gap-3 rounded-xl border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                  <BookOpen className="size-5" />
                  <div className="space-y-1">
                    <p className="font-medium text-foreground">还没有打开项目</p>
                    <p>打开本地文件夹后，这里会按实际目录结构显示章节。</p>
                  </div>
                </div>
              </div>
            ) : state.files.length === 0 ? (
              <div className="flex flex-1 items-center">
                <div className="flex w-full flex-col gap-3 rounded-xl border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                  <FilePlus2 className="size-5" />
                  <div className="space-y-1">
                    <p className="font-medium text-foreground">当前项目还没有 Markdown 章节</p>
                    <p>先新建一个 `.md` 文件，创建后会自动在右侧打开。</p>
                  </div>
                </div>
              </div>
            ) : (
              <ScrollArea className="min-h-0 flex-1">
                <div className="flex flex-col gap-1">{fileTree.map(renderTreeNode)}</div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </aside>

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
