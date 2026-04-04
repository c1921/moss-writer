import { useRef, type Dispatch } from "react";

import type { AppAction } from "../reducer";
import { readFile } from "../../shared/tauri/commands";

interface UseFileLoaderOptions {
  dispatch: Dispatch<AppAction>;
  toMessage: (error: unknown) => string;
}

export function useFileLoader({ dispatch, toMessage }: UseFileLoaderOptions) {
  const activeLoadIdRef = useRef(0);

  function invalidateFileLoad() {
    activeLoadIdRef.current += 1;
    return activeLoadIdRef.current;
  }

  async function loadFile(path: string) {
    const requestId = invalidateFileLoad();
    dispatch({ type: "editor/fileLoading" });

    try {
      const content = await readFile(path);
      if (activeLoadIdRef.current !== requestId) {
        return false;
      }

      dispatch({ type: "editor/fileLoaded", path, content });
      return true;
    } catch (error) {
      if (activeLoadIdRef.current !== requestId) {
        return false;
      }

      dispatch({ type: "editor/cleared" });
      dispatch({ type: "error/set", message: toMessage(error) });
      return false;
    }
  }

  return {
    invalidateFileLoad,
    loadFile,
  };
}
