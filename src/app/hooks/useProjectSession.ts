import { useEffect } from "react";

import { clearSessionState, loadSessionState, saveSessionState } from "../../features/settings/session";

interface UseProjectSessionOptions {
  projectPath: string | null;
  currentFilePath: string | null;
  openProjectPath: (projectPath: string, preferredFilePath?: string | null) => Promise<boolean>;
}

export function useProjectSession({
  projectPath,
  currentFilePath,
  openProjectPath,
}: UseProjectSessionOptions) {
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
  }, [openProjectPath]);

  useEffect(() => {
    saveSessionState({
      projectPath,
      currentFilePath,
    });
  }, [projectPath, currentFilePath]);
}
