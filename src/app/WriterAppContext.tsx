import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useRef,
  type PropsWithChildren,
} from "react";

import { appReducer, initialAppState } from "./reducer";
import type { AppState, FileEntry, SyncResponse } from "./types";
import { clearSessionState, loadSessionState, saveSessionState } from "../features/settings/session";
import { pullSync, pushSync } from "../features/sync/syncService";
import { pickProjectDirectory } from "../shared/tauri/dialog";
import {
  createFile as createFileCommand,
  deleteFile as deleteFileCommand,
  listFiles,
  openProject,
  readFile,
  renameFile as renameFileCommand,
  writeFile,
} from "../shared/tauri/commands";

interface WriterAppContextValue {
  state: AppState;
  openProjectPicker: () => Promise<void>;
  openProjectPath: (projectPath: string, preferredFilePath?: string | null) => Promise<boolean>;
  refreshFiles: () => Promise<FileEntry[]>;
  selectFile: (path: string) => Promise<void>;
  createFile: (name: string) => Promise<void>;
  renameFile: (path: string, newName: string) => Promise<void>;
  deleteFile: (path: string) => Promise<void>;
  updateEditorContent: (content: string) => void;
  clearError: () => void;
  pushSync: () => Promise<SyncResponse>;
  pullSync: () => Promise<SyncResponse>;
}

const WriterAppContext = createContext<WriterAppContextValue | null>(null);

function toMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "发生了未知错误";
}

export function WriterAppProvider({ children }: PropsWithChildren) {
  const [state, dispatch] = useReducer(appReducer, initialAppState);
  const stateRef = useRef(state);
  const saveTimerRef = useRef<number | null>(null);
  const savePromiseRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  function clearSaveTimer() {
    if (saveTimerRef.current === null) {
      return;
    }

    window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
  }

  async function loadFile(path: string) {
    dispatch({ type: "editor/fileLoading" });

    try {
      const content = await readFile(path);
      dispatch({ type: "editor/fileLoaded", path, content });
    } catch (error) {
      dispatch({ type: "editor/cleared" });
      dispatch({ type: "error/set", message: toMessage(error) });
    }
  }

  async function saveCurrentFile() {
    clearSaveTimer();

    if (savePromiseRef.current) {
      await savePromiseRef.current;
    }

    const snapshot = stateRef.current;
    if (!snapshot.currentFilePath || !snapshot.isDirty) {
      return;
    }

    const path = snapshot.currentFilePath;
    const content = snapshot.editorContent;
    const pendingSave = (async () => {
      dispatch({ type: "editor/saveStarted" });

      try {
        await writeFile(path, content);
        dispatch({ type: "editor/saveSucceeded", path, content });
      } catch (error) {
        dispatch({ type: "editor/saveFailed", message: toMessage(error) });
      }
    })();

    savePromiseRef.current = pendingSave;
    await pendingSave.finally(() => {
      if (savePromiseRef.current === pendingSave) {
        savePromiseRef.current = null;
      }
    });

    const latest = stateRef.current;
    if (
      latest.currentFilePath === path &&
      latest.isDirty &&
      latest.editorContent !== content &&
      savePromiseRef.current === null
    ) {
      window.setTimeout(() => {
        void saveCurrentFile();
      }, 0);
    }
  }

  async function flushPendingSave() {
    if (!stateRef.current.currentFilePath || !stateRef.current.isDirty) {
      return true;
    }

    await saveCurrentFile();
    return !stateRef.current.isDirty;
  }

  async function openProjectPath(projectPath: string, preferredFilePath?: string | null) {
    const canContinue = await flushPendingSave();
    if (!canContinue) {
      return false;
    }

    dispatch({ type: "project/openStarted" });

    try {
      const snapshot = await openProject(projectPath);
      dispatch({ type: "project/opened", snapshot });

      const targetFile =
        preferredFilePath && snapshot.files.some((file) => file.path === preferredFilePath)
          ? preferredFilePath
          : snapshot.files[0]?.path ?? null;

      if (targetFile) {
        await loadFile(targetFile);
      } else {
        dispatch({ type: "editor/cleared" });
      }

      return true;
    } catch (error) {
      dispatch({ type: "app/reset" });
      dispatch({ type: "error/set", message: toMessage(error) });
      return false;
    }
  }

  async function openProjectPicker() {
    const selectedPath = await pickProjectDirectory(stateRef.current.projectPath);
    if (!selectedPath) {
      return;
    }

    await openProjectPath(selectedPath);
  }

  async function refreshFiles() {
    const projectPath = stateRef.current.projectPath;
    if (!projectPath) {
      return [];
    }

    const previousCurrentFilePath = stateRef.current.currentFilePath;

    try {
      const files = await listFiles(projectPath);
      dispatch({ type: "project/filesUpdated", files });

      if (
        previousCurrentFilePath &&
        !files.some((file) => file.path === previousCurrentFilePath) &&
        files[0]
      ) {
        await loadFile(files[0].path);
      }

      return files;
    } catch (error) {
      dispatch({ type: "error/set", message: toMessage(error) });
      return stateRef.current.files;
    }
  }

  async function selectFile(path: string) {
    if (stateRef.current.currentFilePath === path) {
      return;
    }

    const canContinue = await flushPendingSave();
    if (!canContinue) {
      return;
    }

    await loadFile(path);
  }

  async function createFile(name: string) {
    if (!stateRef.current.projectPath) {
      return;
    }

    const canContinue = await flushPendingSave();
    if (!canContinue) {
      return;
    }

    try {
      const createdFile = await createFileCommand(name);
      await refreshFiles();
      await loadFile(createdFile.path);
    } catch (error) {
      dispatch({ type: "error/set", message: toMessage(error) });
    }
  }

  async function renameFile(path: string, newName: string) {
    const renamingCurrentFile = stateRef.current.currentFilePath === path;

    if (renamingCurrentFile) {
      const canContinue = await flushPendingSave();
      if (!canContinue) {
        return;
      }
    }

    try {
      const renamedFile = await renameFileCommand(path, newName);
      await refreshFiles();

      if (renamingCurrentFile) {
        await loadFile(renamedFile.path);
      }
    } catch (error) {
      dispatch({ type: "error/set", message: toMessage(error) });
    }
  }

  async function deleteFile(path: string) {
    const deletingCurrentFile = stateRef.current.currentFilePath === path;

    if (deletingCurrentFile) {
      const canContinue = await flushPendingSave();
      if (!canContinue) {
        return;
      }
    }

    try {
      await deleteFileCommand(path);
      const files = await refreshFiles();

      if (deletingCurrentFile) {
        if (files[0]) {
          await loadFile(files[0].path);
        } else {
          dispatch({ type: "editor/cleared" });
        }
      }
    } catch (error) {
      dispatch({ type: "error/set", message: toMessage(error) });
    }
  }

  function updateEditorContent(content: string) {
    dispatch({ type: "editor/contentChanged", content });
  }

  function clearError() {
    dispatch({ type: "error/clear" });
  }

  useEffect(() => {
    const session = loadSessionState();
    if (!session?.projectPath) {
      return;
    }

    void openProjectPath(session.projectPath, session.currentFilePath).then((opened) => {
      if (!opened) {
        clearSessionState();
      }
    });
  }, []);

  useEffect(() => {
    saveSessionState({
      projectPath: state.projectPath,
      currentFilePath: state.currentFilePath,
    });
  }, [state.projectPath, state.currentFilePath]);

  useEffect(() => {
    clearSaveTimer();

    if (!state.currentFilePath || !state.isDirty) {
      return;
    }

    saveTimerRef.current = window.setTimeout(() => {
      void saveCurrentFile();
    }, 800);

    return () => {
      clearSaveTimer();
    };
  }, [state.currentFilePath, state.editorContent, state.isDirty]);

  useEffect(() => {
    function flushOnBlur() {
      void saveCurrentFile();
    }

    function flushOnVisibilityChange() {
      if (document.visibilityState === "hidden") {
        void saveCurrentFile();
      }
    }

    window.addEventListener("blur", flushOnBlur);
    window.addEventListener("beforeunload", flushOnBlur);
    document.addEventListener("visibilitychange", flushOnVisibilityChange);

    return () => {
      window.removeEventListener("blur", flushOnBlur);
      window.removeEventListener("beforeunload", flushOnBlur);
      document.removeEventListener("visibilitychange", flushOnVisibilityChange);
    };
  }, []);

  const contextValue: WriterAppContextValue = {
    state,
    openProjectPicker,
    openProjectPath,
    refreshFiles,
    selectFile,
    createFile,
    renameFile,
    deleteFile,
    updateEditorContent,
    clearError,
    pushSync,
    pullSync,
  };

  return <WriterAppContext.Provider value={contextValue}>{children}</WriterAppContext.Provider>;
}

export function useWriterApp() {
  const context = useContext(WriterAppContext);

  if (!context) {
    throw new Error("useWriterApp 必须在 WriterAppProvider 内使用");
  }

  return context;
}
