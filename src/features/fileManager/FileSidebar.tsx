import { useId, useState, type FormEvent } from "react";
import {
  BookOpen,
  FilePlus2,
  FileText,
  FolderOpen,
  LoaderCircle,
  PencilLine,
  RefreshCw,
  Trash2,
} from "lucide-react";

import { useWriterApp } from "@/app/WriterAppContext";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { getBaseName, stripMarkdownExtension } from "@/shared/utils/fileNames";

type NameDialogState =
  | { mode: "create" }
  | { mode: "rename"; path: string; currentName: string }
  | null;

export function FileSidebar() {
  const { state, openProjectPicker, refreshFiles, selectFile, createFile, renameFile, deleteFile } =
    useWriterApp();
  const [nameDialog, setNameDialog] = useState<NameDialogState>(null);
  const [nameValue, setNameValue] = useState("");
  const [isSubmittingName, setIsSubmittingName] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ path: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const nameInputId = useId();

  const busy = state.isProjectLoading || state.isFileLoading;
  const actionsDisabled = busy || isSubmittingName || isDeleting;
  const isRenameDialog = nameDialog?.mode === "rename";

  function resetNameDialog() {
    setNameDialog(null);
    setNameValue("");
  }

  function openCreateDialog() {
    setNameDialog({ mode: "create" });
    setNameValue("新章节");
  }

  function openRenameDialog(path: string, currentName: string) {
    setNameDialog({ mode: "rename", path, currentName });
    setNameValue(stripMarkdownExtension(currentName));
  }

  async function handleSubmitNameDialog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextName = nameValue.trim();
    if (!nameDialog || !nextName) {
      return;
    }

    if (nameDialog.mode === "rename") {
      const currentName = stripMarkdownExtension(nameDialog.currentName);
      if (nextName === currentName) {
        resetNameDialog();
        return;
      }
    }

    setIsSubmittingName(true);

    try {
      if (nameDialog.mode === "create") {
        await createFile(nextName);
      } else {
        await renameFile(nameDialog.path, nextName);
      }

      resetNameDialog();
    } finally {
      setIsSubmittingName(false);
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) {
      return;
    }

    setIsDeleting(true);

    try {
      await deleteFile(deleteTarget.path);
      setDeleteTarget(null);
    } finally {
      setIsDeleting(false);
    }
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
                disabled={state.isProjectLoading || isSubmittingName || isDeleting}
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

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">章节列表</p>
                <p className="text-xs text-muted-foreground">仅显示项目根目录下的 `.md` 文件</p>
              </div>
              <Badge variant="outline">{state.files.length}</Badge>
            </div>

            {!state.projectPath ? (
              <div className="flex flex-1 items-center">
                <div className="flex w-full flex-col gap-3 rounded-xl border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                  <BookOpen className="size-5" />
                  <div className="space-y-1">
                    <p className="font-medium text-foreground">还没有打开项目</p>
                    <p>打开本地文件夹后，这里会显示章节列表。</p>
                  </div>
                </div>
              </div>
            ) : state.files.length === 0 ? (
              <div className="flex flex-1 items-center">
                <div className="flex w-full flex-col gap-3 rounded-xl border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                  <FilePlus2 className="size-5" />
                  <div className="space-y-1">
                    <p className="font-medium text-foreground">当前项目还没有章节</p>
                    <p>先新建一个 `.md` 文件，创建后会自动在右侧打开。</p>
                  </div>
                </div>
              </div>
            ) : (
              <ScrollArea className="min-h-0 flex-1">
                <ul className="space-y-2 pr-3">
                  {state.files.map((file) => {
                    const isActive = file.path === state.currentFilePath;

                    return (
                      <li key={file.path}>
                        <div
                          className={cn(
                            "group flex items-center gap-1 rounded-xl border p-1 transition-colors",
                            isActive
                              ? "border-ring/40 bg-accent/60"
                              : "border-transparent hover:border-border hover:bg-muted/40",
                          )}
                        >
                          <Button
                            className="h-auto flex-1 justify-start px-3 py-2"
                            disabled={actionsDisabled}
                            onClick={() => void selectFile(file.path)}
                            type="button"
                            variant="ghost"
                          >
                            <FileText
                              className={cn(
                                "size-4 shrink-0",
                                isActive ? "text-foreground" : "text-muted-foreground",
                              )}
                            />
                            <div className="min-w-0 text-left">
                              <div className="truncate font-medium">
                                {stripMarkdownExtension(file.name)}
                              </div>
                              <div className="truncate text-xs text-muted-foreground">
                                {file.name}
                              </div>
                            </div>
                          </Button>

                          <div className="flex items-center gap-1 pr-1">
                            <Button
                              aria-label={`重命名 ${file.name}`}
                              disabled={actionsDisabled}
                              onClick={() => openRenameDialog(file.path, file.name)}
                              size="icon-sm"
                              type="button"
                              variant="ghost"
                            >
                              <PencilLine className="size-4" />
                            </Button>
                            <Button
                              aria-label={`删除 ${file.name}`}
                              disabled={actionsDisabled}
                              onClick={() => setDeleteTarget({ path: file.path, name: file.name })}
                              size="icon-sm"
                              type="button"
                              variant="ghost"
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </aside>

      <Dialog
        onOpenChange={(open) => {
          if (!open && !isSubmittingName) {
            resetNameDialog();
          }
        }}
        open={nameDialog !== null}
      >
        <DialogContent showCloseButton={!isSubmittingName}>
          <form className="space-y-4" onSubmit={handleSubmitNameDialog}>
            <DialogHeader>
              <DialogTitle>{isRenameDialog ? "重命名章节" : "新建章节"}</DialogTitle>
              <DialogDescription>
                {isRenameDialog
                  ? "修改名称后，会同步重命名对应的 `.md` 文件。"
                  : "创建后会在当前项目根目录新增一个 `.md` 文件并自动打开。"}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor={nameInputId}>
                章节名称
              </label>
              <Input
                autoFocus
                id={nameInputId}
                onChange={(event) => setNameValue(event.currentTarget.value)}
                placeholder="例如：第一章"
                value={nameValue}
              />
              <p className="text-xs text-muted-foreground">无需输入 `.md` 扩展名。</p>
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
                {isRenameDialog ? "保存名称" : "创建章节"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        onOpenChange={(open) => {
          if (!open && !isDeleting) {
            setDeleteTarget(null);
          }
        }}
        open={deleteTarget !== null}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogMedia>
              <Trash2 className="size-5" />
            </AlertDialogMedia>
            <AlertDialogTitle>删除章节</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `确定删除《${stripMarkdownExtension(deleteTarget.name)}》吗？此操作不可撤销。`
                : "此操作不可撤销。"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting}
              onClick={() => void handleDeleteConfirm()}
              type="button"
              variant="destructive"
            >
              {isDeleting ? <LoaderCircle className="size-4 animate-spin" /> : null}
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
