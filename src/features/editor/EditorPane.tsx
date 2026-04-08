import type { ReactElement } from "react";
import { BookOpen, FileText } from "lucide-react";

import {
  useWriterAppActions,
  useWriterEditorState,
  useWriterProjectState,
} from "@/app/WriterAppContext";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type EditorPaneVariant = "standard" | "mini";

interface EditorPaneProps {
  variant?: EditorPaneVariant;
}

function renderEmptyState(
  title: string,
  description: string,
  badgeLabel: string,
  icon: ReactElement,
) {
  return (
    <section className="flex flex-1 items-center justify-center">
      <div className="flex max-w-md flex-col items-center gap-4 py-10 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          {icon}
        </div>
        <Badge variant="outline">{badgeLabel}</Badge>
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
          <p className="text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
      </div>
    </section>
  );
}

function renderMiniPane(
  placeholder: string,
  value: string,
  disabled: boolean,
) {
  return (
    <section className="flex h-full flex-1 flex-col">
      <div className="flex flex-1 flex-col px-3 pb-3">
        <Textarea
          aria-label="小说正文编辑区"
          className={cn(
            "flex-1 resize-none border-0 bg-transparent px-1 py-0 text-[15px] leading-7 shadow-none focus-visible:border-transparent focus-visible:ring-0 md:text-base",
            disabled && "text-muted-foreground",
          )}
          disabled={disabled}
          placeholder={placeholder}
          spellCheck={false}
          value={value}
        />
      </div>
    </section>
  );
}

export function EditorPane({ variant = "standard" }: EditorPaneProps) {
  const projectState = useWriterProjectState();
  const editorState = useWriterEditorState();
  const { updateEditorContent } = useWriterAppActions();
  const isMini = variant === "mini";

  if (!projectState.projectPath) {
    if (isMini) {
      return renderMiniPane("先在正常模式打开一个项目", "", true);
    }

    return renderEmptyState(
      "先打开一个小说项目",
      "项目中的 `.md` 文件会按实际目录结构显示在左侧，右侧保持纯文本写作体验。",
      "专注写作",
      <BookOpen className="size-5" />,
    );
  }

  if (!editorState.currentFilePath) {
    if (isMini) {
      return renderMiniPane("先在正常模式选择一个章节", "", true);
    }

    return renderEmptyState(
      "选择一个章节开始写作",
      "如果当前项目还没有章节，可以在左侧新建一个 `.md` 文件。",
      "项目已打开",
      <FileText className="size-5" />,
    );
  }

  if (isMini) {
    return (
      <section className="flex h-full flex-1 flex-col">
        <div className="flex flex-1 flex-col px-3 pb-3">
          <Textarea
            aria-label="小说正文编辑区"
            className="flex-1 resize-none border-0 bg-transparent px-1 py-0 text-[15px] leading-7 shadow-none focus-visible:border-transparent focus-visible:ring-0 md:text-base"
            disabled={editorState.isFileLoading}
            onChange={(event) => updateEditorContent(event.currentTarget.value)}
            placeholder="开始写作..."
            spellCheck={false}
            value={editorState.editorContent}
          />
        </div>
      </section>
    );
  }

  return (
    <section className="flex h-full flex-1 flex-col">
      <div className="flex flex-1 flex-col px-6 py-4">
        <Textarea
          aria-label="小说正文编辑区"
          className="flex-1 resize-none border-0 px-1 py-0 text-base leading-8 shadow-none focus-visible:border-transparent focus-visible:ring-0 md:text-lg"
          disabled={editorState.isFileLoading}
          onChange={(event) => updateEditorContent(event.currentTarget.value)}
          placeholder="开始写作..."
          spellCheck={false}
          value={editorState.editorContent}
        />
      </div>
    </section>
  );
}
