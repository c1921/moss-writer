export interface MiniWindowGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MiniWindowPreferences {
  miniGeometry: MiniWindowGeometry | null;
}

const WINDOW_PREFERENCES_STORAGE_KEY = "moss-writer/window-preferences-v1";

const DEFAULT_WINDOW_PREFERENCES: MiniWindowPreferences = {
  miniGeometry: null,
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeMiniGeometry(value: unknown): MiniWindowGeometry | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<MiniWindowGeometry>;
  if (
    !isFiniteNumber(candidate.x) ||
    !isFiniteNumber(candidate.y) ||
    !isFiniteNumber(candidate.width) ||
    !isFiniteNumber(candidate.height)
  ) {
    return null;
  }

  return {
    x: candidate.x,
    y: candidate.y,
    width: candidate.width,
    height: candidate.height,
  };
}

export function loadMiniWindowPreferences(): MiniWindowPreferences {
  const rawValue = window.localStorage.getItem(WINDOW_PREFERENCES_STORAGE_KEY);
  if (!rawValue) {
    return DEFAULT_WINDOW_PREFERENCES;
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<MiniWindowPreferences>;
    return {
      miniGeometry: normalizeMiniGeometry(parsed.miniGeometry),
    };
  } catch {
    window.localStorage.removeItem(WINDOW_PREFERENCES_STORAGE_KEY);
    return DEFAULT_WINDOW_PREFERENCES;
  }
}

export function saveMiniWindowPreferences(preferences: MiniWindowPreferences) {
  window.localStorage.setItem(WINDOW_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
}
