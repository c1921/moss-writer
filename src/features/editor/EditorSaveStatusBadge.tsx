import { useWriterEditorState } from "@/app/WriterAppContext";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function renderSaveStatus(saveStatus: string, isDirty: boolean, isFileLoading: boolean) {
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

function getSaveBadgeClass(saveStatus: string, isDirty: boolean, isFileLoading: boolean) {
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

interface EditorSaveStatusBadgeProps {
  className?: string;
  compact?: boolean;
  showUnavailable?: boolean;
}

export function EditorSaveStatusBadge({
  className,
  compact = false,
  showUnavailable = false,
}: EditorSaveStatusBadgeProps) {
  const editorState = useWriterEditorState();

  if (!editorState.currentFilePath) {
    if (!showUnavailable) {
      return null;
    }

    return (
      <Badge
        className={cn(
          "border border-border/70 text-muted-foreground",
          compact && "h-6 rounded-full px-2.5 py-0 text-[11px]",
          className,
        )}
        data-testid="editor-save-status"
        variant="outline"
      >
        未打开
      </Badge>
    );
  }

  const saveLabel = renderSaveStatus(
    editorState.saveStatus,
    editorState.isDirty,
    editorState.isFileLoading,
  );
  const saveBadgeClassName = getSaveBadgeClass(
    editorState.saveStatus,
    editorState.isDirty,
    editorState.isFileLoading,
  );

  return (
    <Badge
      className={cn(
        "border",
        saveBadgeClassName,
        compact && "h-6 rounded-full px-2.5 py-0 text-[11px]",
        className,
      )}
      data-testid="editor-save-status"
      variant="outline"
    >
      {saveLabel}
    </Badge>
  );
}
