import { useWriterApp } from "../../app/WriterAppContext";
import { getBaseName, stripMarkdownExtension } from "../../shared/utils/fileNames";

function promptForFileName(title: string, value = "") {
  const nextValue = window.prompt(title, value)?.trim();
  return nextValue ? nextValue : null;
}

export function FileSidebar() {
  const { state, openProjectPicker, refreshFiles, selectFile, createFile, renameFile, deleteFile } =
    useWriterApp();

  const busy = state.isProjectLoading || state.isFileLoading;

  async function handleCreateFile() {
    const name = promptForFileName("输入新章节名称", "新章节");
    if (!name) {
      return;
    }

    await createFile(name);
  }

  async function handleRenameFile(path: string, currentName: string) {
    const nextName = promptForFileName("输入新的章节名称", stripMarkdownExtension(currentName));
    if (!nextName || nextName === stripMarkdownExtension(currentName)) {
      return;
    }

    await renameFile(path, nextName);
  }

  async function handleDeleteFile(path: string, currentName: string) {
    const confirmed = window.confirm(`确定删除《${stripMarkdownExtension(currentName)}》吗？`);
    if (!confirmed) {
      return;
    }

    await deleteFile(path);
  }

  return (
    <aside className="sidebar">
      <div className="sidebar__header">
        <div>
          <p className="sidebar__eyebrow">Moss Writer</p>
          <h1 className="sidebar__title">
            {state.projectPath ? getBaseName(state.projectPath) : "极简小说编辑器"}
          </h1>
          <p className="sidebar__subtitle">
            {state.projectPath ?? "选择一个本地文件夹作为小说项目"}
          </p>
        </div>
        <button
          className="button button--primary"
          onClick={() => void openProjectPicker()}
          disabled={state.isProjectLoading}
          type="button"
        >
          {state.projectPath ? "切换项目" : "打开项目"}
        </button>
      </div>

      <div className="sidebar__toolbar">
        <button
          className="button"
          onClick={() => void handleCreateFile()}
          disabled={!state.projectPath || busy}
          type="button"
        >
          新建章节
        </button>
        <button
          className="button"
          onClick={() => void refreshFiles()}
          disabled={!state.projectPath || busy}
          type="button"
        >
          刷新
        </button>
      </div>

      <div className="sidebar__section">
        <div className="sidebar__section-header">
          <span>章节</span>
          <span>{state.files.length}</span>
        </div>

        {!state.projectPath ? (
          <div className="sidebar__empty">打开项目后，这里会显示根目录下的 `.md` 文件。</div>
        ) : state.files.length === 0 ? (
          <div className="sidebar__empty">当前项目还没有章节，先新建一个 `.md` 文件。</div>
        ) : (
          <ul className="file-list">
            {state.files.map((file) => {
              const isActive = file.path === state.currentFilePath;

              return (
                <li className={`file-list__item ${isActive ? "is-active" : ""}`} key={file.path}>
                  <button
                    className="file-list__main"
                    onClick={() => void selectFile(file.path)}
                    disabled={busy}
                    type="button"
                  >
                    <span className="file-list__name">{stripMarkdownExtension(file.name)}</span>
                    <span className="file-list__ext">.md</span>
                  </button>

                  <div className="file-list__actions">
                    <button
                      aria-label={`重命名 ${file.name}`}
                      className="icon-button"
                      onClick={() => void handleRenameFile(file.path, file.name)}
                      disabled={busy}
                      type="button"
                    >
                      改
                    </button>
                    <button
                      aria-label={`删除 ${file.name}`}
                      className="icon-button"
                      onClick={() => void handleDeleteFile(file.path, file.name)}
                      disabled={busy}
                      type="button"
                    >
                      删
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
