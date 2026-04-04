import { useWriterApp } from "../../app/WriterAppContext";
import { stripMarkdownExtension } from "../../shared/utils/fileNames";

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

export function EditorPane() {
  const { state, updateEditorContent } = useWriterApp();
  const saveLabel = renderSaveStatus(
    state.saveStatus,
    state.isDirty,
    state.currentFilePath,
    state.isFileLoading,
  );

  if (!state.projectPath) {
    return (
      <section className="editor-pane editor-pane--empty">
        <div className="editor-pane__placeholder">
          <p className="editor-pane__eyebrow">专注写作</p>
          <h2>先打开一个小说项目</h2>
          <p>项目根目录下的 `.md` 文件会显示在左侧，右侧只保留纯文本编辑体验。</p>
        </div>
      </section>
    );
  }

  if (!state.currentFilePath) {
    return (
      <section className="editor-pane editor-pane--empty">
        <div className="editor-pane__placeholder">
          <p className="editor-pane__eyebrow">项目已打开</p>
          <h2>选择一个章节开始写作</h2>
          <p>如果当前项目还没有章节，可以在左侧创建一个新的 `.md` 文件。</p>
        </div>
      </section>
    );
  }

  return (
    <section className="editor-pane">
      <header className="editor-pane__header">
        <div>
          <p className="editor-pane__eyebrow">当前章节</p>
          <h2 className="editor-pane__title">
            {stripMarkdownExtension(state.currentFilePath)}
          </h2>
        </div>
        <div className={`status-badge status-badge--${state.saveStatus}`}>{saveLabel}</div>
      </header>

      <textarea
        aria-label="小说正文编辑区"
        className="editor-pane__textarea"
        disabled={state.isFileLoading}
        onChange={(event) => updateEditorContent(event.currentTarget.value)}
        placeholder="开始写作..."
        spellCheck={false}
        value={state.editorContent}
      />
    </section>
  );
}
