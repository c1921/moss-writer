import { useMemo, type ReactElement } from "react";
import { BookOpen, FileText } from "lucide-react";

import {
  useWriterAppActions,
  useWriterEditorState,
  useWriterProjectState,
} from "@/app/WriterAppContext";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { getBaseName, stripMarkdownExtension } from "@/shared/utils/fileNames";

function renderSaveStatus(
  saveStatus: string,
  isDirty: boolean,
  currentFilePath: string | null,
  isFileLoading: boolean,
) {
  if (!currentFilePath) {
    return "未打开章节";
  }

  if (isFileLoading) {
    return "正在打开";
  }

  if (saveStatus === "saving") {
    return "正在保存";
  }

  if (saveStatus === "error") {
    return "保存失败";
  }

  if (isDirty) {
    return "未保存";
  }

  if (saveStatus === "saved") {
    return "已保存";
  }

  return "就绪";
}

function getSaveBadgeClass(
  saveStatus: string,
  isDirty: boolean,
  currentFilePath: string | null,
  isFileLoading: boolean,
) {
  if (!currentFilePath) {
    return "border-border/70 text-muted-foreground";
  }

  if (isFileLoading || saveStatus === "saving") {
    return "border-transparent bg-secondary text-secondary-foreground";
  }

  if (saveStatus === "error") {
    return "border-transparent bg-destructive/10 text-destructive";
  }

  if (isDirty) {
    return "border-transparent bg-amber-500/10 text-amber-700 dark:text-amber-300";
  }

  if (saveStatus === "saved") {
    return "border-transparent bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  }

  return "border-border/70 text-muted-foreground";
}

function renderEmptyState(
  title: string,
  description: string,
  badgeLabel: string,
  icon: ReactElement,
) {
  return (
    <section className="flex min-h-[22rem] flex-1">
      <Card className="flex flex-1 items-center justify-center border-0 shadow-sm">
        <CardContent className="flex max-w-md flex-col items-center gap-4 py-10 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            {icon}
          </div>
          <Badge variant="outline">{badgeLabel}</Badge>
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
            <p className="text-sm leading-6 text-muted-foreground">{description}</p>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

export function EditorPane() {
  const projectState = useWriterProjectState();
  const editorState = useWriterEditorState();
  const { updateEditorContent } = useWriterAppActions();
  const saveLabel = renderSaveStatus(
    editorState.saveStatus,
    editorState.isDirty,
    editorState.currentFilePath,
    editorState.isFileLoading,
  );
  const saveBadgeClassName = getSaveBadgeClass(
    editorState.saveStatus,
    editorState.isDirty,
    editorState.currentFilePath,
    editorState.isFileLoading,
  );
  const currentFileName = useMemo(() => {
    if (!editorState.currentFilePath) {
      return null;
    }

    const matchedFile = projectState.files.find((file) => file.path === editorState.currentFilePath);
    return stripMarkdownExtension(matchedFile?.name ?? getBaseName(editorState.currentFilePath));
  }, [projectState.files, editorState.currentFilePath]);

  if (!projectState.projectPath) {
    return renderEmptyState(
      "先打开一个小说项目",
      "项目中的 `.md` 文件会按实际目录结构显示在左侧，右侧保持纯文本写作体验。",
      "专注写作",
      <BookOpen className="size-5" />,
    );
  }

  if (!editorState.currentFilePath) {
    return renderEmptyState(
      "选择一个章节开始写作",
      "如果当前项目还没有章节，可以在左侧新建一个 `.md` 文件。",
      "项目已打开",
      <FileText className="size-5" />,
    );
  }

  return (
    <section className="flex min-h-[22rem] flex-1">
      <Card className="flex min-h-full flex-1 border-0 shadow-sm">
        <CardHeader className="gap-3 border-b">
          <div className="space-y-1">
            <p className="text-xs font-medium tracking-[0.24em] text-muted-foreground uppercase">
              当前章节
            </p>
            <CardTitle className="text-2xl font-semibold tracking-tight">
              {currentFileName}
            </CardTitle>
            <p className="truncate text-sm text-muted-foreground">{editorState.currentFilePath}</p>
          </div>

          <div className="flex items-center gap-2">
            <Badge className={cn("border", saveBadgeClassName)} variant="outline">
              {saveLabel}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="flex min-h-0 flex-1 flex-col pt-4">
          <Textarea
            aria-label="小说正文编辑区"
            className="min-h-[60vh] flex-1 resize-none border-0 px-1 py-0 text-base leading-8 shadow-none focus-visible:border-transparent focus-visible:ring-0 md:text-lg"
            disabled={editorState.isFileLoading}
            onChange={(event) => updateEditorContent(event.currentTarget.value)}
            placeholder="开始写作..."
            spellCheck={false}
            value={editorState.editorContent}
          />
        </CardContent>
      </Card>
    </section>
  );
}
