import { useEffect, useRef, type Dispatch, type MutableRefObject } from "react";

import type { AppAction } from "../reducer";
import type { AppState } from "../types";
import { writeFile } from "../../shared/tauri/commands";

interface UseAutosaveOptions {
  state: AppState;
  stateRef: MutableRefObject<AppState>;
  dispatch: Dispatch<AppAction>;
  toMessage: (error: unknown) => string;
  onSaveSuccess?: (path: string, content: string) => void;
}

export function useAutosave({
  state,
  stateRef,
  dispatch,
  toMessage,
  onSaveSuccess,
}: UseAutosaveOptions) {
  const saveTimerRef = useRef<number | null>(null);
  const savePromiseRef = useRef<Promise<void> | null>(null);
  const saveCurrentFileImplRef = useRef<() => Promise<void>>(async () => {});
  const flushPendingSaveImplRef = useRef<() => Promise<boolean>>(async () => true);
  const prepareForExternalReloadImplRef = useRef<() => Promise<void>>(async () => {});
  const apiRef = useRef<{
    saveCurrentFile: () => Promise<void>;
    flushPendingSave: () => Promise<boolean>;
    prepareForExternalReload: () => Promise<void>;
  } | null>(null);

  function clearSaveTimer() {
    if (saveTimerRef.current === null) {
      return;
    }

    window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
  }

  saveCurrentFileImplRef.current = async () => {
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
        onSaveSuccess?.(path, content);
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
        void saveCurrentFileImplRef.current();
      }, 0);
    }
  };

  flushPendingSaveImplRef.current = async () => {
    if (!stateRef.current.currentFilePath || !stateRef.current.isDirty) {
      return true;
    }

    await saveCurrentFileImplRef.current();
    return !stateRef.current.isDirty;
  };

  prepareForExternalReloadImplRef.current = async () => {
    clearSaveTimer();

    if (savePromiseRef.current) {
      await savePromiseRef.current;
    }
  };

  if (!apiRef.current) {
    apiRef.current = {
      saveCurrentFile: () => saveCurrentFileImplRef.current(),
      flushPendingSave: () => flushPendingSaveImplRef.current(),
      prepareForExternalReload: () => prepareForExternalReloadImplRef.current(),
    };
  }

  useEffect(() => {
    clearSaveTimer();

    if (!state.currentFilePath || !state.isDirty) {
      return;
    }

    saveTimerRef.current = window.setTimeout(() => {
      void saveCurrentFileImplRef.current();
    }, 800);

    return () => {
      clearSaveTimer();
    };
  }, [state.currentFilePath, state.editorContent, state.isDirty]);

  useEffect(() => {
    function flushOnBlur() {
      void saveCurrentFileImplRef.current();
    }

    function flushOnVisibilityChange() {
      if (document.visibilityState === "hidden") {
        void saveCurrentFileImplRef.current();
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

  return apiRef.current;
}
