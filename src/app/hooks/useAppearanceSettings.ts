import { useState } from "react"

import {
  loadAppearanceSettings,
  saveAppearanceSettings,
  type AppearanceSettings,
} from "@/app/appearanceSettings"

export function useAppearanceSettings() {
  const [settings, setSettings] = useState<AppearanceSettings>(
    () => loadAppearanceSettings()
  )

  function updateSettings(next: AppearanceSettings) {
    setSettings(next)
    saveAppearanceSettings(next)
  }

  return { settings, updateSettings }
}
