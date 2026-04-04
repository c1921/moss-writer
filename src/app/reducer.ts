import type { AppState, FileEntry, ProjectSnapshot } from "./types";

type AppAction =
  | { type: "app/reset" }
  | { type: "error/set"; message: string }
  | { type: "error/clear" }
  | { type: "project/openStarted" }
  | { type: "project/opened"; snapshot: ProjectSnapshot }
  | { type: "project/filesUpdated"; files: FileEntry[] }
  | { type: "editor/fileLoading" }
  | { type: "editor/fileLoaded"; path: string; content: string }
  | { type: "editor/cleared" }
  | { type: "editor/contentChanged"; content: string }
  | { type: "editor/saveStarted" }
  | { type: "editor/saveSucceeded"; path: string; content: string }
  | { type: "editor/saveFailed"; message: string };

export const initialAppState: AppState = {
  projectPath: null,
  files: [],
  currentFilePath: null,
  editorContent: "",
  saveStatus: "idle",
  appError: null,
  isDirty: false,
  isProjectLoading: false,
  isFileLoading: false,
};

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "app/reset":
      return initialAppState;

    case "error/set":
      return {
        ...state,
        appError: action.message,
      };

    case "error/clear":
      return {
        ...state,
        appError: null,
      };

    case "project/openStarted":
      return {
        ...state,
        appError: null,
        isProjectLoading: true,
      };

    case "project/opened":
      return {
        ...state,
        projectPath: action.snapshot.projectPath,
        files: action.snapshot.files,
        currentFilePath: null,
        editorContent: "",
        saveStatus: "idle",
        appError: null,
        isDirty: false,
        isProjectLoading: false,
        isFileLoading: false,
      };

    case "project/filesUpdated": {
      const currentFileStillExists =
        state.currentFilePath === null
          ? true
          : action.files.some((file) => file.path === state.currentFilePath);

      if (currentFileStillExists) {
        return {
          ...state,
          files: action.files,
          appError: null,
        };
      }

      return {
        ...state,
        files: action.files,
        currentFilePath: null,
        editorContent: "",
        saveStatus: "idle",
        appError: null,
        isDirty: false,
        isFileLoading: false,
      };
    }

    case "editor/fileLoading":
      return {
        ...state,
        appError: null,
        isFileLoading: true,
      };

    case "editor/fileLoaded":
      return {
        ...state,
        currentFilePath: action.path,
        editorContent: action.content,
        saveStatus: "idle",
        appError: null,
        isDirty: false,
        isFileLoading: false,
      };

    case "editor/cleared":
      return {
        ...state,
        currentFilePath: null,
        editorContent: "",
        saveStatus: "idle",
        isDirty: false,
        isFileLoading: false,
      };

    case "editor/contentChanged":
      return {
        ...state,
        editorContent: action.content,
        saveStatus: state.currentFilePath ? "idle" : state.saveStatus,
        isDirty: state.currentFilePath ? true : state.isDirty,
      };

    case "editor/saveStarted":
      return {
        ...state,
        saveStatus: "saving",
      };

    case "editor/saveSucceeded": {
      const savedCurrentFile =
        state.currentFilePath === action.path && state.editorContent === action.content;

      return {
        ...state,
        saveStatus: savedCurrentFile ? "saved" : "idle",
        isDirty: savedCurrentFile ? false : state.isDirty,
      };
    }

    case "editor/saveFailed":
      return {
        ...state,
        saveStatus: "error",
        appError: action.message,
      };

    default:
      return state;
  }
}

export type { AppAction };
