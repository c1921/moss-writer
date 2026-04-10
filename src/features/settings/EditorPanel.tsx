import type { AppearanceSettings } from "@/app/appearanceSettings"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

interface EditorPanelProps {
  settings: AppearanceSettings
  onChangeSettings: (settings: AppearanceSettings) => void
}

export function EditorPanel({ settings, onChangeSettings }: EditorPanelProps) {
  function updateNumber(
    key: "mainEditorFontSize" | "miniEditorFontSize",
    rawValue: string,
    min: number,
    max: number
  ) {
    const parsed = parseInt(rawValue, 10)
    if (!Number.isFinite(parsed)) return

    const clamped = Math.min(max, Math.max(min, parsed))
    onChangeSettings({ ...settings, [key]: clamped })
  }

  return (
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
              onChange={(event) =>
                updateNumber("mainEditorFontSize", event.currentTarget.value, 10, 28)
              }
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
              onChange={(event) =>
                updateNumber("miniEditorFontSize", event.currentTarget.value, 10, 28)
              }
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
  )
}
