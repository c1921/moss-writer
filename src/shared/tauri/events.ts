import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export const PROJECT_FILES_CHANGED_EVENT = "project-files-changed";

export type ProjectFilesChangedKind = "create" | "modify" | "remove";

export interface ProjectFilesChangedEvent {
  projectPath: string;
  kind: ProjectFilesChangedKind;
  paths: string[];
}

export function listenProjectFilesChanged(
  handler: (payload: ProjectFilesChangedEvent) => void,
) {
  return listen<ProjectFilesChangedEvent>(PROJECT_FILES_CHANGED_EVENT, (event) =>
    handler(event.payload),
  ) as Promise<UnlistenFn>;
}
