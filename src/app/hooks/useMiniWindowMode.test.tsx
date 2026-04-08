import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const canManageWindowMock = vi.fn();
const getCurrentAppWindowMock = vi.fn();
const createLogicalSizeMock = vi.fn((width: number, height: number) => ({
  type: "size",
  width,
  height,
}));
const createLogicalPositionMock = vi.fn((x: number, y: number) => ({
  type: "position",
  x,
  y,
}));

vi.mock("@/shared/tauri/window", () => ({
  canManageWindow: () => canManageWindowMock(),
  getCurrentAppWindow: () => getCurrentAppWindowMock(),
  createLogicalSize: (width: number, height: number) => createLogicalSizeMock(width, height),
  createLogicalPosition: (x: number, y: number) => createLogicalPositionMock(x, y),
}));

import { useMiniWindowMode } from "@/app/hooks/useMiniWindowMode";

function HookHarness() {
  const { isMiniWindowMode, enterMiniWindowMode, exitMiniWindowMode } = useMiniWindowMode();

  return (
    <div>
      <div data-testid="mini-mode">{String(isMiniWindowMode)}</div>
      <button onClick={() => void enterMiniWindowMode()} type="button">
        enter-mini
      </button>
      <button onClick={() => void exitMiniWindowMode()} type="button">
        exit-mini
      </button>
    </div>
  );
}

describe("useMiniWindowMode", () => {
  const unlistenMovedMock = vi.fn();
  const unlistenResizedMock = vi.fn();
  let scaleFactor = 2;
  let outerPosition = { x: 1000, y: 800 };
  let innerSize = { width: 2400, height: 1600 };
  let movedHandler: (() => void) | null = null;
  let resizedHandler: (() => void) | null = null;
  const currentWindowMock = {
    scaleFactor: vi.fn(async () => scaleFactor),
    outerPosition: vi.fn(async () => outerPosition),
    innerSize: vi.fn(async () => innerSize),
    isMaximized: vi.fn(async () => false),
    setDecorations: vi.fn(async () => {}),
    setAlwaysOnTop: vi.fn(async () => {}),
    setSkipTaskbar: vi.fn(async () => {}),
    setShadow: vi.fn(async () => {}),
    setResizable: vi.fn(async () => {}),
    setSize: vi.fn(async () => {}),
    setPosition: vi.fn(async () => {}),
    unmaximize: vi.fn(async () => {}),
    maximize: vi.fn(async () => {}),
    startDragging: vi.fn(async () => {}),
    onMoved: vi.fn(async (handler: () => void) => {
      movedHandler = handler;
      return unlistenMovedMock;
    }),
    onResized: vi.fn(async (handler: () => void) => {
      resizedHandler = handler;
      return unlistenResizedMock;
    }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    canManageWindowMock.mockReturnValue(true);
    getCurrentAppWindowMock.mockReturnValue(currentWindowMock);
    scaleFactor = 2;
    outerPosition = { x: 1000, y: 800 };
    innerSize = { width: 2400, height: 1600 };
    movedHandler = null;
    resizedHandler = null;
    currentWindowMock.isMaximized.mockResolvedValue(false);
    localStorage.clear();
    delete document.body.dataset.windowMode;
  });

  it("进入小窗时切换窗口样式并记录默认几何信息", async () => {
    render(<HookHarness />);

    fireEvent.click(screen.getByRole("button", { name: "enter-mini" }));

    await waitFor(() => expect(screen.getByTestId("mini-mode").textContent).toBe("true"));

    expect(currentWindowMock.setDecorations).toHaveBeenCalledWith(false);
    expect(currentWindowMock.setAlwaysOnTop).toHaveBeenCalledWith(true);
    expect(currentWindowMock.setSkipTaskbar).toHaveBeenCalledWith(true);
    expect(currentWindowMock.setShadow).toHaveBeenCalledWith(false);
    expect(createLogicalSizeMock).toHaveBeenCalledWith(420, 320);
    expect(createLogicalPositionMock).toHaveBeenCalledWith(890, 640);
    expect(document.body.dataset.windowMode).toBe("mini");

    expect(JSON.parse(localStorage.getItem("moss-writer/window-preferences-v1") ?? "{}")).toEqual({
      miniGeometry: {
        x: 890,
        y: 640,
        width: 420,
        height: 320,
      },
    });
  });

  it("退出小窗时恢复主窗口几何并保留最新小窗位置", async () => {
    currentWindowMock.isMaximized.mockResolvedValue(true);
    render(<HookHarness />);

    fireEvent.click(screen.getByRole("button", { name: "enter-mini" }));
    await waitFor(() => expect(screen.getByTestId("mini-mode").textContent).toBe("true"));

    outerPosition = { x: 1800, y: 1200 };
    innerSize = { width: 840, height: 640 };

    fireEvent.click(screen.getByRole("button", { name: "exit-mini" }));

    await waitFor(() => expect(screen.getByTestId("mini-mode").textContent).toBe("false"));

    expect(currentWindowMock.unmaximize).toHaveBeenCalledTimes(1);
    expect(currentWindowMock.setAlwaysOnTop).toHaveBeenLastCalledWith(false);
    expect(currentWindowMock.setSkipTaskbar).toHaveBeenLastCalledWith(false);
    expect(currentWindowMock.setDecorations).toHaveBeenLastCalledWith(true);
    expect(currentWindowMock.setSize).toHaveBeenLastCalledWith({
      type: "size",
      width: 1200,
      height: 800,
    });
    expect(currentWindowMock.setPosition).toHaveBeenLastCalledWith({
      type: "position",
      x: 500,
      y: 400,
    });
    expect(currentWindowMock.maximize).toHaveBeenCalledTimes(1);
    expect(document.body.dataset.windowMode).toBe("standard");

    expect(JSON.parse(localStorage.getItem("moss-writer/window-preferences-v1") ?? "{}")).toEqual({
      miniGeometry: {
        x: 900,
        y: 600,
        width: 420,
        height: 320,
      },
    });
  });

  it("小窗移动或缩放后会防抖更新几何信息", async () => {
    vi.useFakeTimers();

    try {
      render(<HookHarness />);

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "enter-mini" }));
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(screen.getByTestId("mini-mode").textContent).toBe("true");

      outerPosition = { x: 2000, y: 1400 };
      innerSize = { width: 960, height: 720 };

      await act(async () => {
        movedHandler?.();
        resizedHandler?.();
        vi.advanceTimersByTime(160);
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(JSON.parse(localStorage.getItem("moss-writer/window-preferences-v1") ?? "{}")).toEqual({
        miniGeometry: {
          x: 1000,
          y: 700,
          width: 480,
          height: 360,
        },
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
