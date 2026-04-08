import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow, LogicalPosition, LogicalSize } from "@tauri-apps/api/window";

export function canManageWindow() {
  return isTauri();
}

export function getCurrentAppWindow() {
  return getCurrentWindow();
}

export function createLogicalSize(width: number, height: number) {
  return new LogicalSize(width, height);
}

export function createLogicalPosition(x: number, y: number) {
  return new LogicalPosition(x, y);
}
