import { beforeEach, describe, expect, it } from "vitest"

import { loadAppearanceSettings, saveAppearanceSettings } from "@/app/appearanceSettings"

describe("appearanceSettings", () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it("旧配置缺少行号开关时回退为默认开启", () => {
    window.localStorage.setItem(
      "moss-writer/appearance-v1",
      JSON.stringify({
        mainEditorFontSize: 18,
        miniEditorFontSize: 14,
        miniWindowOpacity: 66,
        miniWindowShowStatusBar: false,
      })
    )

    expect(loadAppearanceSettings()).toEqual({
      mainEditorFontSize: 18,
      miniEditorFontSize: 14,
      miniWindowOpacity: 66,
      miniWindowShowStatusBar: false,
      showLineNumbers: true,
    })
  })

  it("保存后会持久化行号开关", () => {
    saveAppearanceSettings({
      mainEditorFontSize: 16,
      miniEditorFontSize: 15,
      miniWindowOpacity: 78,
      miniWindowShowStatusBar: true,
      showLineNumbers: false,
    })

    expect(loadAppearanceSettings()).toEqual({
      mainEditorFontSize: 16,
      miniEditorFontSize: 15,
      miniWindowOpacity: 78,
      miniWindowShowStatusBar: true,
      showLineNumbers: false,
    })
  })
})
