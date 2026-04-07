import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";

import { useAutosave } from "./hooks/useAutosave";
import { useFileLoader } from "./hooks/useFileLoader";
import { useProjectSession } from "./hooks/useProjectSession";
import { appReducer, initialAppState } from "./reducer";
import type { AppState, FileEntry, SaveStatus } from "./types";
import {
  DEFAULT_WEB_DAV_SETTINGS,
  type WebDavSettings,
} from "../features/settings/types";
import { pickProjectDirectory } from "../shared/tauri/dialog";
import {
  createFile as createFileCommand,
  createDirectory as createDirectoryCommand,
  deleteFile as deleteFileCommand,
  getSyncSettings as getSyncSettingsCommand,
  listFiles,
  openProject,
  renameFile as renameFileCommand,
  saveSyncSettings as saveSyncSettingsCommand,
  syncPull as syncPullCommand,
  syncPush as syncPushCommand,
  testSyncConnection as testSyncConnectionCommand,
} from "../shared/tauri/commands";
import { listenProjectFilesChanged } from "../shared/tauri/events";
import type {
  SyncDirection,
  SyncResponse,
  SyncState,
} from "../features/sync/types";

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
  flushPendingSave: () => Promise<boolean>;
  refreshProjectFiles: (changedPaths?: string[]) => Promise<void>;
  clearError: () => void;
}

interface WriterSyncStateContextValue extends SyncState {
  settings: WebDavSettings;
}

interface WriterSyncActionsContextValue {
  reloadSyncSettings: () => Promise<void>;
  saveSyncSettings: (settings: WebDavSettings) => Promise<WebDavSettings>;
  testSyncConnection: (settings: WebDavSettings) => Promise<SyncResponse | null>;
  pullSync: () => Promise<SyncResponse | null>;
  pushSync: () => Promise<SyncResponse | null>;
}

const WriterProjectStateContext = createContext<WriterProjectStateContextValue | null>(null);
const WriterEditorStateContext = createContext<WriterEditorStateContextValue | null>(null);
const WriterAppErrorContext = createContext<string | null | undefined>(undefined);
const WriterAppActionsContext = createContext<WriterAppActionsContextValue | null>(null);
const WriterSyncStateContext = createContext<WriterSyncStateContextValue | null>(null);
const WriterSyncActionsContext = createContext<WriterSyncActionsContextValue | null>(null);

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
  const [syncSettings, setSyncSettings] = useState<WebDavSettings>(DEFAULT_WEB_DAV_SETTINGS);
  const [syncState, setSyncState] = useState<SyncState>({
    isSettingsLoading: true,
    isSyncing: false,
    activeDirection: null,
    lastDirection: null,
    lastResult: null,
    lastSuccessfulSyncAt: null,
  });
  const stateRef = useRef<AppState>(state);
  const syncSettingsRef = useRef<WebDavSettings>(DEFAULT_WEB_DAV_SETTINGS);
  const syncStateRef = useRef<SyncState>(syncState);
  const actionsImplRef = useRef<WriterAppActionsContextValue>({
    openProjectPicker: async () => {},
    openProjectPath: async () => false,
    selectFile: async () => {},
    createFile: async () => {},
    createDirectory: async () => {},
    renameFile: async () => {},
    deleteFile: async () => {},
    updateEditorContent: () => {},
    flushPendingSave: async () => true,
    refreshProjectFiles: async () => {},
    clearError: () => {},
  });
  const actionsRef = useRef<WriterAppActionsContextValue | null>(null);
  const syncActionsImplRef = useRef<WriterSyncActionsContextValue>({
    reloadSyncSettings: async () => {},
    saveSyncSettings: async () => DEFAULT_WEB_DAV_SETTINGS,
    testSyncConnection: async () => null,
    pullSync: async () => null,
    pushSync: async () => null,
  });
  const syncActionsRef = useRef<WriterSyncActionsContextValue | null>(null);
  const syncProjectFilesImplRef = useRef<(changedPaths?: string[]) => Promise<FileEntry[]>>(
    async () => [],
  );
  const loadSyncSettingsPromiseRef = useRef<Promise<WebDavSettings> | null>(null);
  const syncRequestPromiseRef = useRef<Promise<SyncResponse | null> | null>(null);
  const lastPushCompletedAtRef = useRef<number | null>(null);
  const previousSaveStatusRef = useRef<SaveStatus>(state.saveStatus);
  const fileChangeSyncTimerRef = useRef<number | null>(null);
  const queuedChangedPathsRef = useRef<Set<string>>(new Set());
  const queuedProjectPathRef = useRef<string | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    syncSettingsRef.current = syncSettings;
  }, [syncSettings]);

  useEffect(() => {
    syncStateRef.current = syncState;
  }, [syncState]);

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

  function setSyncStateWith(update: SyncState | ((current: SyncState) => SyncState)) {
    setSyncState((current) =>
      typeof update === "function" ? (update as (current: SyncState) => SyncState)(current) : update,
    );
  }

  function buildSyncErrorResponse(message: string): SyncResponse {
    return {
      status: "error",
      message,
      changedPaths: [],
      changedDirectories: [],
      conflicts: [],
      skippedDeletionPaths: [],
      syncedAt: null,
    };
  }

  async function loadSyncSettingsInternal(surfaceAppError = false) {
    if (loadSyncSettingsPromiseRef.current) {
      return loadSyncSettingsPromiseRef.current;
    }

    setSyncStateWith((current) => ({
      ...current,
      isSettingsLoading: true,
    }));

    const pending = (async () => {
      try {
        const nextSettings = await getSyncSettingsCommand();
        setSyncSettings(nextSettings);
        return nextSettings;
      } catch (error) {
        if (surfaceAppError) {
          dispatch({ type: "error/set", message: toMessage(error) });
        }
        throw error;
      } finally {
        setSyncStateWith((current) => ({
          ...current,
          isSettingsLoading: false,
        }));
        loadSyncSettingsPromiseRef.current = null;
      }
    })();

    loadSyncSettingsPromiseRef.current = pending;
    return pending;
  }

  async function performSync(
    direction: Exclude<SyncDirection, "test">,
    options: {
      allowWithoutProjectState?: boolean;
      skipFlush?: boolean;
      refreshAfterPull?: boolean;
      surfaceAppError?: boolean;
    } = {},
  ) {
    if (syncRequestPromiseRef.current) {
      return syncRequestPromiseRef.current;
    }

    const pending = (async () => {
      const {
        allowWithoutProjectState = false,
        skipFlush = false,
        refreshAfterPull = true,
        surfaceAppError = false,
      } = options;

      if (!allowWithoutProjectState && !stateRef.current.projectPath) {
        return null;
      }

      if (!skipFlush) {
        const canContinue = await flushPendingSave();
        if (!canContinue) {
          return null;
        }
      }

      try {
        await loadSyncSettingsInternal(surfaceAppError);

        setSyncStateWith((current) => ({
          ...current,
          isSyncing: true,
          activeDirection: direction,
          lastDirection: direction,
        }));

        const response = direction === "pull" ? await syncPullCommand() : await syncPushCommand();

        setSyncStateWith((current) => ({
          ...current,
          isSyncing: false,
          activeDirection: null,
          lastDirection: direction,
          lastResult: response,
          lastSuccessfulSyncAt:
            response.status === "error"
              ? current.lastSuccessfulSyncAt
              : response.syncedAt ?? current.lastSuccessfulSyncAt,
        }));

        if (direction === "push" && response.status !== "error") {
          lastPushCompletedAtRef.current = response.syncedAt ?? Date.now();
        }

        if (direction === "pull" && refreshAfterPull) {
          await syncProjectFilesImplRef.current(response.changedPaths);
        }

        return response;
      } catch (error) {
        const errorResponse = buildSyncErrorResponse(toMessage(error));

        setSyncStateWith((current) => ({
          ...current,
          isSyncing: false,
          activeDirection: null,
          lastDirection: direction,
          lastResult: errorResponse,
        }));

        if (surfaceAppError) {
          dispatch({ type: "error/set", message: errorResponse.message });
        }

        return errorResponse;
      } finally {
        syncRequestPromiseRef.current = null;
      }
    })();

    syncRequestPromiseRef.current = pending;
    return pending;
  }

  async function performSyncTest(settings: WebDavSettings) {
    if (syncRequestPromiseRef.current) {
      return syncRequestPromiseRef.current;
    }

    const pending = (async () => {
      try {
        setSyncStateWith((current) => ({
          ...current,
          isSyncing: true,
          activeDirection: "test",
          lastDirection: "test",
        }));

        const response = await testSyncConnectionCommand(settings);

        setSyncStateWith((current) => ({
          ...current,
          isSyncing: false,
          activeDirection: null,
          lastDirection: "test",
          lastResult: response,
          lastSuccessfulSyncAt:
            response.status === "error"
              ? current.lastSuccessfulSyncAt
              : response.syncedAt ?? current.lastSuccessfulSyncAt,
        }));

        return response;
      } catch (error) {
        const errorResponse = buildSyncErrorResponse(toMessage(error));

        setSyncStateWith((current) => ({
          ...current,
          isSyncing: false,
          activeDirection: null,
          lastDirection: "test",
          lastResult: errorResponse,
        }));

        return errorResponse;
      } finally {
        syncRequestPromiseRef.current = null;
      }
    })();

    syncRequestPromiseRef.current = pending;
    return pending;
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
      } else if (!previousCurrentFilePath && files[0]) {
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
      let snapshot = await openProject(projectPath);

      const resolvedSettings = await loadSyncSettingsInternal();
      if (resolvedSettings.enabled && resolvedSettings.autoPullOnOpen) {
        const pullResponse = await performSync("pull", {
          allowWithoutProjectState: true,
          skipFlush: true,
          refreshAfterPull: false,
          surfaceAppError: true,
        });

        if (
          pullResponse &&
          (pullResponse.changedPaths.length > 0 || pullResponse.changedDirectories.length > 0)
        ) {
          snapshot = {
            projectPath: snapshot.projectPath,
            files: await listFiles(projectPath),
          };
        }
      }

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

  actionsImplRef.current.flushPendingSave = async () => {
    return flushPendingSave();
  };

  actionsImplRef.current.refreshProjectFiles = async (changedPaths = []) => {
    await syncProjectFilesImplRef.current(changedPaths);
  };

  actionsImplRef.current.clearError = () => {
    dispatch({ type: "error/clear" });
  };

  syncActionsImplRef.current.reloadSyncSettings = async () => {
    await loadSyncSettingsInternal();
  };

  syncActionsImplRef.current.saveSyncSettings = async (settings) => {
    const nextSettings = await saveSyncSettingsCommand(settings);
    setSyncSettings(nextSettings);
    setSyncStateWith((current) => ({
      ...current,
      isSettingsLoading: false,
    }));
    return nextSettings;
  };

  syncActionsImplRef.current.testSyncConnection = async (settings) => {
    return performSyncTest(settings);
  };

  syncActionsImplRef.current.pullSync = async () => {
    return performSync("pull");
  };

  syncActionsImplRef.current.pushSync = async () => {
    return performSync("push");
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
      flushPendingSave: () => actionsImplRef.current.flushPendingSave(),
      refreshProjectFiles: (changedPaths) => actionsImplRef.current.refreshProjectFiles(changedPaths),
      clearError: () => actionsImplRef.current.clearError(),
    };
  }

  if (!syncActionsRef.current) {
    syncActionsRef.current = {
      reloadSyncSettings: () => syncActionsImplRef.current.reloadSyncSettings(),
      saveSyncSettings: (settings) => syncActionsImplRef.current.saveSyncSettings(settings),
      testSyncConnection: (settings) => syncActionsImplRef.current.testSyncConnection(settings),
      pullSync: () => syncActionsImplRef.current.pullSync(),
      pushSync: () => syncActionsImplRef.current.pushSync(),
    };
  }

  useEffect(() => {
    void loadSyncSettingsInternal();
  }, []);

  useEffect(() => {
    const previousSaveStatus = previousSaveStatusRef.current;
    previousSaveStatusRef.current = state.saveStatus;

    if (previousSaveStatus === "saved" || state.saveStatus !== "saved") {
      return;
    }

    void (async () => {
      try {
        const settings = await loadSyncSettingsInternal();
        const snapshot = stateRef.current;

        if (
          !snapshot.projectPath ||
          snapshot.isDirty ||
          !settings.enabled ||
          !settings.autoPushOnSave
        ) {
          return;
        }

        const minIntervalMs = settings.autoPushMinIntervalSeconds * 1000;
        const now = Date.now();
        if (
          lastPushCompletedAtRef.current !== null &&
          now - lastPushCompletedAtRef.current < minIntervalMs
        ) {
          return;
        }

        await performSync("push", {
          skipFlush: true,
          surfaceAppError: true,
        });
      } catch (error) {
        dispatch({ type: "error/set", message: toMessage(error) });
      }
    })();
  }, [state.saveStatus]);

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
  const syncStateValue = useMemo<WriterSyncStateContextValue>(
    () => ({
      ...syncState,
      settings: syncSettings,
    }),
    [syncSettings, syncState],
  );

  return (
    <WriterAppActionsContext.Provider value={actionsRef.current}>
      <WriterAppErrorContext.Provider value={state.appError}>
        <WriterSyncActionsContext.Provider value={syncActionsRef.current}>
          <WriterSyncStateContext.Provider value={syncStateValue}>
            <WriterProjectStateContext.Provider value={projectStateValue}>
              <WriterEditorStateContext.Provider value={editorStateValue}>
                {children}
              </WriterEditorStateContext.Provider>
            </WriterProjectStateContext.Provider>
          </WriterSyncStateContext.Provider>
        </WriterSyncActionsContext.Provider>
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

export function useWriterSyncState() {
  const context = useContext(WriterSyncStateContext);

  if (!context) {
    throw new Error("useWriterSyncState 必须在 WriterAppProvider 内使用");
  }

  return context;
}

export function useWriterSyncActions() {
  const context = useContext(WriterSyncActionsContext);

  if (!context) {
    throw new Error("useWriterSyncActions 必须在 WriterAppProvider 内使用");
  }

  return context;
}
