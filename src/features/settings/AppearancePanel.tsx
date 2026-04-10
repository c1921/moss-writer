import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import type { AppearanceSettings } from "@/app/appearanceSettings"

interface AppearancePanelProps {
  settings: AppearanceSettings
  onChangeSettings: (s: AppearanceSettings) => void
}

export function AppearancePanel({ settings, onChangeSettings }: AppearancePanelProps) {
  function updateNumber(
    key: keyof AppearanceSettings,
    rawValue: string,
    min: number,
    max: number,
  ) {
    const parsed = parseInt(rawValue, 10)
    if (!Number.isFinite(parsed)) return
    const clamped = Math.min(max, Math.max(min, parsed))
    onChangeSettings({ ...settings, [key]: clamped })
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">编辑器</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <Label className="shrink-0 text-sm">主窗口字体大小</Label>
            <div className="flex items-center gap-1.5">
              <Input
                className="w-20 text-right"
                max={28}
                min={10}
                onChange={(e) => updateNumber("mainEditorFontSize", e.target.value, 10, 28)}
                step={1}
                type="number"
                value={settings.mainEditorFontSize}
              />
              <span className="text-sm text-muted-foreground">px</span>
            </div>
          </div>
          <div className="flex items-center justify-between gap-4">
            <Label className="shrink-0 text-sm">小窗字体大小</Label>
            <div className="flex items-center gap-1.5">
              <Input
                className="w-20 text-right"
                max={28}
                min={10}
                onChange={(e) => updateNumber("miniEditorFontSize", e.target.value, 10, 28)}
                step={1}
                type="number"
                value={settings.miniEditorFontSize}
              />
              <span className="text-sm text-muted-foreground">px</span>
            </div>
          </div>
          <div className="flex items-center justify-between gap-4">
            <Label className="shrink-0 text-sm" htmlFor="show-line-numbers">
              显示行号
            </Label>
            <Switch
              checked={settings.showLineNumbers}
              id="show-line-numbers"
              onCheckedChange={(checked) =>
                onChangeSettings({ ...settings, showLineNumbers: checked })
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">小窗</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <Label className="shrink-0 text-sm">背景不透明度</Label>
            <div className="flex items-center gap-1.5">
              <Input
                className="w-20 text-right"
                max={100}
                min={10}
                onChange={(e) => updateNumber("miniWindowOpacity", e.target.value, 10, 100)}
                step={5}
                type="number"
                value={settings.miniWindowOpacity}
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          </div>
          <div className="flex items-center justify-between gap-4">
            <Label className="shrink-0 text-sm" htmlFor="mini-show-statusbar">
              显示状态栏
            </Label>
            <Switch
              checked={settings.miniWindowShowStatusBar}
              id="mini-show-statusbar"
              onCheckedChange={(checked) =>
                onChangeSettings({ ...settings, miniWindowShowStatusBar: checked })
              }
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
