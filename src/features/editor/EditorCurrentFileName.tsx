import { useWriterEditorState } from "@/app/WriterAppContext";
import { cn } from "@/lib/utils";
import { getBaseName } from "@/shared/utils/fileNames";

interface EditorCurrentFileNameProps {
  className?: string;
}

export function EditorCurrentFileName({ className }: EditorCurrentFileNameProps) {
  const editorState = useWriterEditorState();

  if (!editorState.currentFilePath) {
    return null;
  }

  return (
    <div
      className={cn("truncate text-center text-sm font-medium text-foreground", className)}
      data-testid="editor-current-file-name"
      title={editorState.currentFilePath}
    >
      {getBaseName(editorState.currentFilePath)}
    </div>
  );
}
