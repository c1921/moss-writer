export type SaveStatus = "idle" | "saving" | "saved" | "error";

export interface FileEntry {
  name: string;
  path: string;
  updatedAt?: number | null;
}

export interface DirectoryEntry {
  name: string;
  path: string;
}

export interface ProjectSnapshot {
  projectPath: string;
  files: FileEntry[];
  directories?: DirectoryEntry[];
}

export interface SessionState {
  projectPath: string | null;
  currentFilePath: string | null;
}

export interface AppState {
  projectPath: string | null;
  files: FileEntry[];
  directories: DirectoryEntry[];
  currentFilePath: string | null;
  editorContent: string;
  saveStatus: SaveStatus;
  appError: string | null;
  isDirty: boolean;
  isProjectLoading: boolean;
  isFileLoading: boolean;
}
