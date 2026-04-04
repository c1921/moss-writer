export type SaveStatus = "idle" | "saving" | "saved" | "error";

export interface FileEntry {
  name: string;
  path: string;
  updatedAt?: number | null;
}

export interface ProjectSnapshot {
  projectPath: string;
  files: FileEntry[];
}

export interface SessionState {
  projectPath: string | null;
  currentFilePath: string | null;
}

export interface AppState {
  projectPath: string | null;
  files: FileEntry[];
  currentFilePath: string | null;
  editorContent: string;
  saveStatus: SaveStatus;
  appError: string | null;
  isDirty: boolean;
  isProjectLoading: boolean;
  isFileLoading: boolean;
}
