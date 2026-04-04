import { WriterAppProvider, useWriterApp } from "./app/WriterAppContext";
import { EditorPane } from "./features/editor/EditorPane";
import { FileSidebar } from "./features/fileManager/FileSidebar";
import "./App.css";

function AppShell() {
  const { state, clearError } = useWriterApp();

  return (
    <main className="app-shell">
      <FileSidebar />
      <div className="workspace">
        {state.appError ? (
          <div className="notice notice--error" role="alert">
            <span>{state.appError}</span>
            <button className="icon-button" onClick={clearError} type="button">
              关闭
            </button>
          </div>
        ) : null}
        <EditorPane />
      </div>
    </main>
  );
}

export default function App() {
  return (
    <WriterAppProvider>
      <AppShell />
    </WriterAppProvider>
  );
}
