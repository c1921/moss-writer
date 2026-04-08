import { useEffect, useRef, useState } from "react";

import {
  loadMiniWindowPreferences,
  saveMiniWindowPreferences,
  type MiniWindowGeometry,
} from "@/app/windowPreferences";
import {
  canManageWindow,
  createLogicalPosition,
  createLogicalSize,
  getCurrentAppWindow,
} from "@/shared/tauri/window";

const DEFAULT_MINI_WIDTH = 420;
const DEFAULT_MINI_HEIGHT = 320;
const MIN_MINI_WIDTH = 320;
const MIN_MINI_HEIGHT = 220;
const PERSIST_DELAY_MS = 160;

interface StandardWindowSnapshot extends MiniWindowGeometry {
  wasMaximized: boolean;
}

function round(value: number) {
  return Math.round(value);
}

function normalizeGeometry(geometry: MiniWindowGeometry): MiniWindowGeometry {
  return {
    x: round(geometry.x),
    y: round(geometry.y),
    width: Math.max(MIN_MINI_WIDTH, round(geometry.width)),
    height: Math.max(MIN_MINI_HEIGHT, round(geometry.height)),
  };
}

async function readCurrentGeometry() {
  const currentWindow = getCurrentAppWindow();
  const [scaleFactor, outerPosition, innerSize] = await Promise.all([
    currentWindow.scaleFactor(),
    currentWindow.outerPosition(),
    currentWindow.innerSize(),
  ]);

  return normalizeGeometry({
    x: outerPosition.x / scaleFactor,
    y: outerPosition.y / scaleFactor,
    width: innerSize.width / scaleFactor,
    height: innerSize.height / scaleFactor,
  });
}

function getTargetMiniGeometry(
  baseGeometry: MiniWindowGeometry,
  preferredGeometry: MiniWindowGeometry | null,
) {
  if (preferredGeometry) {
    return normalizeGeometry(preferredGeometry);
  }

  const width = Math.min(baseGeometry.width, DEFAULT_MINI_WIDTH);
  const height = Math.min(baseGeometry.height, DEFAULT_MINI_HEIGHT);

  return normalizeGeometry({
    x: baseGeometry.x + Math.max((baseGeometry.width - width) / 2, 20),
    y: baseGeometry.y + Math.max((baseGeometry.height - height) / 2, 20),
    width,
    height,
  });
}

function applyWindowModeAttribute(isMiniWindowMode: boolean) {
  document.body.dataset.windowMode = isMiniWindowMode ? "mini" : "standard";
}

export function useMiniWindowMode() {
  const [isMiniWindowMode, setIsMiniWindowMode] = useState(false);
  const standardWindowSnapshotRef = useRef<StandardWindowSnapshot | null>(null);
  const preferredMiniGeometryRef = useRef(loadMiniWindowPreferences().miniGeometry);
  const persistTimerRef = useRef<number | null>(null);
  const isMiniWindowModeRef = useRef(false);
  const isTransitioningRef = useRef(false);

  function clearPersistTimer() {
    if (persistTimerRef.current !== null) {
      window.clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
  }

  function setMiniWindowMode(nextValue: boolean) {
    isMiniWindowModeRef.current = nextValue;
    setIsMiniWindowMode(nextValue);
  }

  function persistMiniGeometry(geometry: MiniWindowGeometry) {
    const normalized = normalizeGeometry(geometry);
    preferredMiniGeometryRef.current = normalized;
    saveMiniWindowPreferences({
      miniGeometry: normalized,
    });
  }

  async function captureCurrentMiniGeometry() {
    const geometry = await readCurrentGeometry();
    persistMiniGeometry(geometry);
    return geometry;
  }

  function schedulePersistCurrentMiniGeometry() {
    if (!canManageWindow() || !isMiniWindowModeRef.current || isTransitioningRef.current) {
      return;
    }

    clearPersistTimer();
    persistTimerRef.current = window.setTimeout(() => {
      persistTimerRef.current = null;
      void captureCurrentMiniGeometry().catch((error) => {
        console.error("记录小窗位置失败", error);
      });
    }, PERSIST_DELAY_MS);
  }

  async function enterMiniWindowMode() {
    if (isTransitioningRef.current || isMiniWindowModeRef.current) {
      return;
    }

    if (!canManageWindow()) {
      setMiniWindowMode(true);
      return;
    }

    isTransitioningRef.current = true;

    try {
      const currentWindow = getCurrentAppWindow();
      const [wasMaximized, currentGeometry] = await Promise.all([
        currentWindow.isMaximized(),
        readCurrentGeometry(),
      ]);

      standardWindowSnapshotRef.current = {
        ...currentGeometry,
        wasMaximized,
      };

      const miniGeometry = getTargetMiniGeometry(
        currentGeometry,
        preferredMiniGeometryRef.current,
      );

      if (wasMaximized) {
        await currentWindow.unmaximize();
      }

      await currentWindow.setDecorations(false);
      await currentWindow.setAlwaysOnTop(true);
      await currentWindow.setSkipTaskbar(true);
      await currentWindow.setResizable(true);

      try {
        await currentWindow.setShadow(false);
      } catch {
        // 某些平台对阴影控制支持不完整，失败时不阻塞小窗模式。
      }

      await currentWindow.setSize(createLogicalSize(miniGeometry.width, miniGeometry.height));
      await currentWindow.setPosition(createLogicalPosition(miniGeometry.x, miniGeometry.y));

      persistMiniGeometry(miniGeometry);
      setMiniWindowMode(true);
    } catch (error) {
      console.error("切换到小窗模式失败", error);
    } finally {
      isTransitioningRef.current = false;
    }
  }

  async function exitMiniWindowMode() {
    if (isTransitioningRef.current || !isMiniWindowModeRef.current) {
      return;
    }

    if (!canManageWindow()) {
      setMiniWindowMode(false);
      return;
    }

    isTransitioningRef.current = true;

    try {
      clearPersistTimer();
      await captureCurrentMiniGeometry().catch((error) => {
        console.error("记录小窗位置失败", error);
      });

      const currentWindow = getCurrentAppWindow();
      const snapshot = standardWindowSnapshotRef.current;

      setMiniWindowMode(false);

      await currentWindow.setAlwaysOnTop(false);
      await currentWindow.setSkipTaskbar(false);
      await currentWindow.setDecorations(true);
      await currentWindow.setResizable(true);

      if (snapshot) {
        await currentWindow.setSize(createLogicalSize(snapshot.width, snapshot.height));
        await currentWindow.setPosition(createLogicalPosition(snapshot.x, snapshot.y));

        if (snapshot.wasMaximized) {
          await currentWindow.maximize();
        }
      }
    } catch (error) {
      console.error("退出小窗模式失败", error);
    } finally {
      isTransitioningRef.current = false;
    }
  }

  async function startWindowDragging() {
    if (!canManageWindow() || !isMiniWindowModeRef.current) {
      return;
    }

    try {
      await getCurrentAppWindow().startDragging();
    } catch (error) {
      console.error("拖动小窗失败", error);
    }
  }

  useEffect(() => {
    applyWindowModeAttribute(isMiniWindowMode);

    return () => {
      delete document.body.dataset.windowMode;
    };
  }, [isMiniWindowMode]);

  useEffect(() => {
    if (!canManageWindow()) {
      return;
    }

    let disposed = false;
    let cleanupMoved: (() => void) | null = null;
    let cleanupResized: (() => void) | null = null;

    void Promise.all([
      getCurrentAppWindow().onMoved(() => {
        if (!disposed) {
          schedulePersistCurrentMiniGeometry();
        }
      }),
      getCurrentAppWindow().onResized(() => {
        if (!disposed) {
          schedulePersistCurrentMiniGeometry();
        }
      }),
    ])
      .then(([unlistenMoved, unlistenResized]) => {
        if (disposed) {
          unlistenMoved();
          unlistenResized();
          return;
        }

        cleanupMoved = unlistenMoved;
        cleanupResized = unlistenResized;
      })
      .catch((error) => {
        console.error("监听窗口移动失败", error);
      });

    return () => {
      disposed = true;
      clearPersistTimer();
      cleanupMoved?.();
      cleanupResized?.();
    };
  }, []);

  return {
    isMiniWindowMode,
    enterMiniWindowMode,
    exitMiniWindowMode,
    startWindowDragging,
  };
}
