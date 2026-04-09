export interface AppearanceSettings {
  mainEditorFontSize: number
  miniEditorFontSize: number
  miniWindowOpacity: number
  miniWindowShowStatusBar: boolean
}

const APPEARANCE_SETTINGS_KEY = "moss-writer/appearance-v1"

const DEFAULT_APPEARANCE_SETTINGS: AppearanceSettings = {
  mainEditorFontSize: 16,
  miniEditorFontSize: 15,
  miniWindowOpacity: 78,
  miniWindowShowStatusBar: true,
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function normalizeAppearanceSettings(parsed: unknown): AppearanceSettings {
  if (!parsed || typeof parsed !== "object") {
    return { ...DEFAULT_APPEARANCE_SETTINGS }
  }

  const candidate = parsed as Record<string, unknown>
  return {
    mainEditorFontSize:
      typeof candidate.mainEditorFontSize === "number"
        ? clamp(candidate.mainEditorFontSize, 10, 28)
        : DEFAULT_APPEARANCE_SETTINGS.mainEditorFontSize,
    miniEditorFontSize:
      typeof candidate.miniEditorFontSize === "number"
        ? clamp(candidate.miniEditorFontSize, 10, 28)
        : DEFAULT_APPEARANCE_SETTINGS.miniEditorFontSize,
    miniWindowOpacity:
      typeof candidate.miniWindowOpacity === "number"
        ? clamp(candidate.miniWindowOpacity, 10, 100)
        : DEFAULT_APPEARANCE_SETTINGS.miniWindowOpacity,
    miniWindowShowStatusBar:
      typeof candidate.miniWindowShowStatusBar === "boolean"
        ? candidate.miniWindowShowStatusBar
        : DEFAULT_APPEARANCE_SETTINGS.miniWindowShowStatusBar,
  }
}

export function loadAppearanceSettings(): AppearanceSettings {
  const rawValue = window.localStorage.getItem(APPEARANCE_SETTINGS_KEY)
  if (!rawValue) {
    return { ...DEFAULT_APPEARANCE_SETTINGS }
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown
    return normalizeAppearanceSettings(parsed)
  } catch {
    window.localStorage.removeItem(APPEARANCE_SETTINGS_KEY)
    return { ...DEFAULT_APPEARANCE_SETTINGS }
  }
}

export function saveAppearanceSettings(settings: AppearanceSettings): void {
  window.localStorage.setItem(APPEARANCE_SETTINGS_KEY, JSON.stringify(settings))
}
