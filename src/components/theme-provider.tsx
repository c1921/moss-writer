import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow, type Theme as TauriTheme } from "@tauri-apps/api/window";
import { type PropsWithChildren, useEffect } from "react";

type Theme = "light" | "dark";

const SYSTEM_DARK_QUERY = "(prefers-color-scheme: dark)";

function normalizeTheme(theme: TauriTheme | null): Theme | null {
  return theme === "dark" || theme === "light" ? theme : null;
}

function getSystemTheme(mediaQuery: MediaQueryList): Theme {
  return mediaQuery.matches ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;

  root.classList.remove("light", "dark");
  root.classList.add(theme);
  root.style.colorScheme = theme;
}

export function ThemeProvider({ children }: PropsWithChildren) {
  useEffect(() => {
    const mediaQuery = window.matchMedia(SYSTEM_DARK_QUERY);
    const syncWithSystemTheme = () => {
      applyTheme(getSystemTheme(mediaQuery));
    };

    syncWithSystemTheme();
    mediaQuery.addEventListener("change", syncWithSystemTheme);

    let cleanupTauriListener: (() => void) | null = null;
    let disposed = false;

    if (isTauri()) {
      void (async () => {
        try {
          const currentWindow = getCurrentWindow();
          const initialTheme = normalizeTheme(await currentWindow.theme());

          if (!disposed && initialTheme) {
            applyTheme(initialTheme);
          }

          const unlisten = await currentWindow.onThemeChanged(({ payload }) => {
            const nextTheme = normalizeTheme(payload);

            if (nextTheme) {
              applyTheme(nextTheme);
            }
          });

          if (disposed) {
            unlisten();
            return;
          }

          cleanupTauriListener = unlisten;
        } catch (error) {
          console.error("同步 Tauri 系统主题失败", error);
        }
      })();
    }

    return () => {
      disposed = true;
      mediaQuery.removeEventListener("change", syncWithSystemTheme);
      cleanupTauriListener?.();
    };
  }, []);

  return children;
}
