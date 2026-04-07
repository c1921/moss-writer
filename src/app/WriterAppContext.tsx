import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type PropsWithChildren,
} from "react";

import { useAutosave } from "./hooks/useAutosave";
import { useFileLoader } from "./hooks/useFileLoader";
import { useProjectSession } from "./hooks/useProjectSession";
import { appReducer, initialAppState } from "./reducer";
import type { AppState, FileEntry, SaveStatus } from "./types";
import { pickProjectDirectory } from "../shared/tauri/dialog";
import {
  createFile as createFileCommand,
  createDirectory as createDirectoryCommand,
  deleteFile as deleteFileCommand,
  listFiles,
  openProject,
  renameFile as renameFileCommand,
} from "../shared/tauri/commands";
import { listenProjectFilesChanged } from "../shared/tauri/events";

interface WriterProjectStateContextValue {
  projectPath: string | null;
  files: FileEntry[];
  currentFilePath: string | null;
  isProjectLoading: boolean;
  isFileLoading: boolean;
}

interface WriterEditorStateContextValue {
  currentFilePath: string | null;
  editorContent: string;
  saveStatus: SaveStatus;
  isDirty: boolean;
  isFileLoading: boolean;
}

interface WriterAppActionsContextValue {
  openProjectPicker: () => Promise<void>;
  openProjectPath: (projectPath: string, preferredFilePath?: string | null) => Promise<boolean>;
  selectFile: (path: string) => Promise<void>;
  createFile: (name: string) => Promise<void>;
  createDirectory: (path: string) => Promise<void>;
  renameFile: (path: string, newName: string) => Promise<void>;
  deleteFile: (path: string) => Promise<void>;
  updateEditorContent: (content: string) => void;
  clearError: () => void;
}

const WriterProjectStateContext = createContext<WriterProjectStateContextValue | null>(null);
const WriterEditorStateContext = createContext<WriterEditorStateContextValue | null>(null);
const WriterAppErrorContext = createContext<string | null | undefined>(undefined);
const WriterAppActionsContext = createContext<WriterAppActionsContextValue | null>(null);

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
  const stateRef = useRef<AppState>(state);
  const actionsImplRef = useRef<WriterAppActionsContextValue>({
    openProjectPicker: async () => {},
    openProjectPath: async () => false,
    selectFile: async () => {},
    createFile: async () => {},
    createDirectory: async () => {},
    renameFile: async () => {},
    deleteFile: async () => {},
    updateEditorContent: () => {},
    clearError: () => {},
  });
  const actionsRef = useRef<WriterAppActionsContextValue | null>(null);
  const syncProjectFilesImplRef = useRef<(changedPaths?: string[]) => Promise<FileEntry[]>>(
    async () => [],
  );
  const fileChangeSyncTimerRef = useRef<number | null>(null);
  const queuedChangedPathsRef = useRef<Set<string>>(new Set());
  const queuedProjectPathRef = useRef<string | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const { invalidateFileLoad, loadFile } = useFileLoader({
    dispatch,
    toMessage,
  });
  const { flushPendingSave, prepareForExternalReload } = useAutosave({
    state,
    stateRef,
    dispatch,
    toMessage,
  });

  function clearQueuedFileSync() {
    if (fileChangeSyncTimerRef.current !== null) {
      window.clearTimeout(fileChangeSyncTimerRef.current);
      fileChangeSyncTimerRef.current = null;
    }

    queuedChangedPathsRef.current.clear();
    queuedProjectPathRef.current = null;
  }

  syncProjectFilesImplRef.current = async (changedPaths = []) => {
    const projectPath = stateRef.current.projectPath;
    if (!projectPath) {
      return [];
    }

    const previousCurrentFilePath = stateRef.current.currentFilePath;

    try {
      const files = await listFiles(projectPath);
      const currentFileStillExists = previousCurrentFilePath
        ? files.some((file) => file.path === previousCurrentFilePath)
        : false;
      const currentFileWasChanged =
        previousCurrentFilePath !== null && changedPaths.includes(previousCurrentFilePath);

      if (
        previousCurrentFilePath &&
        (currentFileWasChanged || !currentFileStillExists)
      ) {
        await prepareForExternalReload();
      }

      dispatch({ type: "project/filesUpdated", files });

      if (previousCurrentFilePath && currentFileStillExists && currentFileWasChanged) {
        await loadFile(previousCurrentFilePath);
      } else if (
        previousCurrentFilePath &&
        !currentFileStillExists &&
        files[0]
      ) {
        await loadFile(files[0].path);
      }

      return files;
    } catch (error) {
      dispatch({ type: "error/set", message: toMessage(error) });
      return stateRef.current.files;
    }
  };

  actionsImplRef.current.openProjectPath = async (projectPath, preferredFilePath) => {
    clearQueuedFileSync();

    const canContinue = await flushPendingSave();
    if (!canContinue) {
      return false;
    }

    invalidateFileLoad();
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
  };

  actionsImplRef.current.openProjectPicker = async () => {
    const selectedPath = await pickProjectDirectory(stateRef.current.projectPath);
    if (!selectedPath) {
      return;
    }

    await actionsImplRef.current.openProjectPath(selectedPath);
  };

  actionsImplRef.current.selectFile = async (path) => {
    if (stateRef.current.currentFilePath === path) {
      return;
    }

    const canContinue = await flushPendingSave();
    if (!canContinue) {
      return;
    }

    await loadFile(path);
  };

  actionsImplRef.current.createFile = async (name) => {
    if (!stateRef.current.projectPath) {
      return;
    }

    const canContinue = await flushPendingSave();
    if (!canContinue) {
      return;
    }

    try {
      const createdFile = await createFileCommand(name);
      dispatch({ type: "project/fileAdded", file: createdFile });
      await loadFile(createdFile.path);
    } catch (error) {
      dispatch({ type: "error/set", message: toMessage(error) });
    }
  };

  actionsImplRef.current.createDirectory = async (path) => {
    if (!stateRef.current.projectPath) {
      return;
    }

    try {
      await createDirectoryCommand(path);
    } catch (error) {
      dispatch({ type: "error/set", message: toMessage(error) });
    }
  };

  actionsImplRef.current.renameFile = async (path, newName) => {
    const renamingCurrentFile = stateRef.current.currentFilePath === path;

    if (renamingCurrentFile) {
      const canContinue = await flushPendingSave();
      if (!canContinue) {
        return;
      }
    }

    try {
      const renamedFile = await renameFileCommand(path, newName);
      dispatch({ type: "project/fileRenamed", previousPath: path, file: renamedFile });
    } catch (error) {
      dispatch({ type: "error/set", message: toMessage(error) });
    }
  };

  actionsImplRef.current.deleteFile = async (path) => {
    const deletingCurrentFile = stateRef.current.currentFilePath === path;

    if (deletingCurrentFile) {
      const canContinue = await flushPendingSave();
      if (!canContinue) {
        return;
      }
    }

    const remainingFiles = stateRef.current.files.filter((file) => file.path !== path);

    try {
      await deleteFileCommand(path);
      dispatch({ type: "project/fileDeleted", path });

      if (deletingCurrentFile && remainingFiles[0]) {
        await loadFile(remainingFiles[0].path);
      }
    } catch (error) {
      dispatch({ type: "error/set", message: toMessage(error) });
    }
  };

  actionsImplRef.current.updateEditorContent = (content) => {
    dispatch({ type: "editor/contentChanged", content });
  };

  actionsImplRef.current.clearError = () => {
    dispatch({ type: "error/clear" });
  };

  if (!actionsRef.current) {
    actionsRef.current = {
      openProjectPicker: () => actionsImplRef.current.openProjectPicker(),
      openProjectPath: (projectPath, preferredFilePath) =>
        actionsImplRef.current.openProjectPath(projectPath, preferredFilePath),
      selectFile: (path) => actionsImplRef.current.selectFile(path),
      createFile: (name) => actionsImplRef.current.createFile(name),
      createDirectory: (path) => actionsImplRef.current.createDirectory(path),
      renameFile: (path, newName) => actionsImplRef.current.renameFile(path, newName),
      deleteFile: (path) => actionsImplRef.current.deleteFile(path),
      updateEditorContent: (content) => actionsImplRef.current.updateEditorContent(content),
      clearError: () => actionsImplRef.current.clearError(),
    };
  }

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;

    void listenProjectFilesChanged((payload) => {
      const activeProjectPath = stateRef.current.projectPath;
      if (!activeProjectPath || payload.projectPath !== activeProjectPath) {
        return;
      }

      if (
        queuedProjectPathRef.current !== null &&
        queuedProjectPathRef.current !== payload.projectPath
      ) {
        clearQueuedFileSync();
      }

      queuedProjectPathRef.current = payload.projectPath;

      for (const path of payload.paths) {
        queuedChangedPathsRef.current.add(path);
      }

      if (fileChangeSyncTimerRef.current !== null) {
        return;
      }

      const scheduledProjectPath = payload.projectPath;
      fileChangeSyncTimerRef.current = window.setTimeout(() => {
        fileChangeSyncTimerRef.current = null;

        const changedPaths = [...queuedChangedPathsRef.current];
        queuedChangedPathsRef.current.clear();
        queuedProjectPathRef.current = null;

        if (disposed || stateRef.current.projectPath !== scheduledProjectPath) {
          return;
        }

        void syncProjectFilesImplRef.current(changedPaths);
      }, 200);
    })
      .then((nextUnlisten) => {
        if (disposed) {
          nextUnlisten();
          return;
        }

        unlisten = nextUnlisten;
      })
      .catch(() => {});

    return () => {
      disposed = true;
      clearQueuedFileSync();
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  useProjectSession({
    projectPath: state.projectPath,
    currentFilePath: state.currentFilePath,
    openProjectPath: actionsRef.current.openProjectPath,
  });

  const projectStateValue = useMemo<WriterProjectStateContextValue>(
    () => ({
      projectPath: state.projectPath,
      files: state.files,
      currentFilePath: state.currentFilePath,
      isProjectLoading: state.isProjectLoading,
      isFileLoading: state.isFileLoading,
    }),
    [
      state.projectPath,
      state.files,
      state.currentFilePath,
      state.isProjectLoading,
      state.isFileLoading,
    ],
  );
  const editorStateValue = useMemo<WriterEditorStateContextValue>(
    () => ({
      currentFilePath: state.currentFilePath,
      editorContent: state.editorContent,
      saveStatus: state.saveStatus,
      isDirty: state.isDirty,
      isFileLoading: state.isFileLoading,
    }),
    [
      state.currentFilePath,
      state.editorContent,
      state.saveStatus,
      state.isDirty,
      state.isFileLoading,
    ],
  );

  return (
    <WriterAppActionsContext.Provider value={actionsRef.current}>
      <WriterAppErrorContext.Provider value={state.appError}>
        <WriterProjectStateContext.Provider value={projectStateValue}>
          <WriterEditorStateContext.Provider value={editorStateValue}>
            {children}
          </WriterEditorStateContext.Provider>
        </WriterProjectStateContext.Provider>
      </WriterAppErrorContext.Provider>
    </WriterAppActionsContext.Provider>
  );
}

export function useWriterProjectState() {
  const context = useContext(WriterProjectStateContext);

  if (!context) {
    throw new Error("useWriterProjectState 必须在 WriterAppProvider 内使用");
  }

  return context;
}

export function useWriterEditorState() {
  const context = useContext(WriterEditorStateContext);

  if (!context) {
    throw new Error("useWriterEditorState 必须在 WriterAppProvider 内使用");
  }

  return context;
}

export function useWriterAppError() {
  const context = useContext(WriterAppErrorContext);

  if (context === undefined) {
    throw new Error("useWriterAppError 必须在 WriterAppProvider 内使用");
  }

  return context;
}

export function useWriterAppActions() {
  const context = useContext(WriterAppActionsContext);

  if (!context) {
    throw new Error("useWriterAppActions 必须在 WriterAppProvider 内使用");
  }

  return context;
}
