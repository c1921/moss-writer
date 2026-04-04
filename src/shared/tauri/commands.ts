import { invoke } from "@tauri-apps/api/core";

import type { FileEntry, ProjectSnapshot } from "../../app/types";
import type { SyncResponse } from "../../features/sync/types";

function command<T>(name: string, args?: Record<string, unknown>) {
  return invoke<T>(name, args);
}

export function openProject(directory: string) {
  return command<ProjectSnapshot>("open_project", { directory });
}

export function readFile(path: string) {
  return command<string>("read_file", { path });
}

export function writeFile(path: string, content: string) {
  return command<void>("write_file", { path, content });
}

export function listFiles(directory: string) {
  return command<FileEntry[]>("list_files", { directory });
}

export function createFile(path: string) {
  return command<FileEntry>("create_file", { path });
}

export function renameFile(path: string, newName: string) {
  return command<FileEntry>("rename_file", { path, newName });
}

export function deleteFile(path: string) {
  return command<void>("delete_file", { path });
}

export function syncPush() {
  return command<SyncResponse>("sync_push");
}

export function syncPull() {
  return command<SyncResponse>("sync_pull");
}
