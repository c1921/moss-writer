import { useEffect, useMemo, useState, type FormEvent } from "react"
import {
  CloudDownload,
  CloudUpload,
  RefreshCcw,
  ShieldCheck,
} from "lucide-react"

import {
  useWriterProjectState,
  useWriterSyncActions,
  useWriterSyncState,
} from "@/app/WriterAppContext"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import type { WebDavSettings } from "@/features/settings/types"
import { getBaseName } from "@/shared/utils/fileNames"

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function toMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === "string") {
    return error
  }

  return "发生了未知错误"
}

function isSameSettings(left: WebDavSettings, right: WebDavSettings) {
  return (
    left.enabled === right.enabled &&
    left.rootUrl === right.rootUrl &&
    left.username === right.username &&
    left.password === right.password &&
    left.autoPullOnOpen === right.autoPullOnOpen &&
    left.autoPushOnSave === right.autoPushOnSave &&
    left.autoPushMinIntervalSeconds === right.autoPushMinIntervalSeconds
  )
}

function getRemotePreview(rootUrl: string, projectPath: string | null) {
  const normalizedRoot = rootUrl.trim().replace(/\/+$/, "")
  const projectName = projectPath ? getBaseName(projectPath) : "当前项目名"
  const relativePath = `MossWriter/${projectName}`

  if (!normalizedRoot) {
    return relativePath
  }

  return `${normalizedRoot}/${relativePath}`
}

function getConflictLabel(reason: string) {
  switch (reason) {
    case "bothModified":
      return "本地和远端都改过"
    case "initialContentMismatch":
      return "初次同步时内容不一致"
    case "localModifiedRemoteDeleted":
      return "本地修改过，但远端已删除"
    case "localOnlyChange":
      return "这是本地独有改动，当前方向不会自动处理"
    case "remoteModifiedLocalDeleted":
      return "远端修改过，但本地已删除"
    case "remoteOnlyChange":
      return "这是远端独有改动，当前方向不会自动处理"
    default:
      return "存在未自动处理的差异"
  }
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const projectState = useWriterProjectState()
  const syncState = useWriterSyncState()
  const syncActions = useWriterSyncActions()
  const [form, setForm] = useState<WebDavSettings>(syncState.settings)
  const [isSaving, setIsSaving] = useState(false)
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setForm(syncState.settings)
      setSaveFeedback(null)
    }
  }, [open, syncState.settings])

  const isDirty = useMemo(
    () => !isSameSettings(form, syncState.settings),
    [form, syncState.settings]
  )
  const remotePreview = getRemotePreview(form.rootUrl, projectState.projectPath)
  const projectBound = Boolean(projectState.projectPath)
  const hasConnectionDraft = Boolean(form.rootUrl.trim() && form.username.trim() && form.password)
  const hasSavedSyncConfig = Boolean(
    syncState.settings.enabled &&
      syncState.settings.rootUrl.trim() &&
      syncState.settings.username.trim() &&
      syncState.settings.password
  )
  const actionsDisabled = syncState.isSyncing || isSaving

  function updateField<Key extends keyof WebDavSettings>(
    key: Key,
    value: WebDavSettings[Key]
  ) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }))
  }

  async function persistForm() {
    setIsSaving(true)
    setSaveFeedback(null)

    try {
      const saved = await syncActions.saveSyncSettings({
        ...form,
        autoPushMinIntervalSeconds: Math.max(
          30,
          Number.isFinite(form.autoPushMinIntervalSeconds)
            ? form.autoPushMinIntervalSeconds
            : 120
        ),
      })
      setForm(saved)
      setSaveFeedback("设置已保存")
      return saved
    } catch (error) {
      setSaveFeedback(toMessage(error))
      throw error
    } finally {
      setIsSaving(false)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    try {
      await persistForm()
    } catch {}
  }

  async function handleTestConnection() {
    await syncActions.testSyncConnection({
      ...form,
      autoPushMinIntervalSeconds: Math.max(30, form.autoPushMinIntervalSeconds || 120),
    })
  }

  async function handleManualPull() {
    try {
      if (isDirty) {
        await persistForm()
      }
    } catch {
      return
    }

    await syncActions.pullSync()
  }

  async function handleManualPush() {
    try {
      if (isDirty) {
        await persistForm()
      }
    } catch {
      return
    }

    await syncActions.pushSync()
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-[min(44rem,calc(100%-1.5rem))] sm:max-w-[44rem]">
        <form className="space-y-4" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>设置</DialogTitle>
            <DialogDescription>
              配置 WebDAV 连接，并控制打开项目自动拉取、保存后按最小时间间隔自动推送。
            </DialogDescription>
          </DialogHeader>

          <Card>
            <CardHeader>
              <CardTitle>WebDAV 连接</CardTitle>
              <CardDescription>账号密码会保存在本机应用配置中。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                <div className="space-y-1">
                  <Label htmlFor="webdav-enabled">启用 WebDAV 同步</Label>
                  <p className="text-xs text-muted-foreground">
                    关闭后保留配置，但不会自动拉取或自动推送。
                  </p>
                </div>
                <Switch
                  checked={form.enabled}
                  id="webdav-enabled"
                  onCheckedChange={(checked) => updateField("enabled", checked)}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="webdav-root-url">WebDAV 根地址</Label>
                  <Input
                    id="webdav-root-url"
                    onChange={(event) => updateField("rootUrl", event.currentTarget.value)}
                    placeholder="https://dav.example.com/remote.php/dav/files/you"
                    value={form.rootUrl}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="webdav-username">用户名</Label>
                  <Input
                    id="webdav-username"
                    onChange={(event) => updateField("username", event.currentTarget.value)}
                    placeholder="writer"
                    value={form.username}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="webdav-password">密码</Label>
                  <Input
                    id="webdav-password"
                    onChange={(event) => updateField("password", event.currentTarget.value)}
                    placeholder="••••••••"
                    type="password"
                    value={form.password}
                  />
                </div>
              </div>

              <div className="rounded-lg border bg-muted/30 px-3 py-2">
                <p className="text-sm font-medium">远端项目映射</p>
                <p className="mt-1 break-all text-xs text-muted-foreground">{remotePreview}</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={!hasConnectionDraft || actionsDisabled}
                  onClick={() => void handleTestConnection()}
                  type="button"
                  variant="outline"
                >
                  <ShieldCheck className="size-4" />
                  测试连接
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>自动同步</CardTitle>
              <CardDescription>
                打开项目自动拉取；保存成功后，如果达到最小时间间隔，则自动推送。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                <div className="space-y-1">
                  <Label htmlFor="auto-pull-on-open">打开项目自动拉取</Label>
                  <p className="text-xs text-muted-foreground">
                    打开本地项目后先从远端拉取，再载入章节列表。
                  </p>
                </div>
                <Switch
                  checked={form.autoPullOnOpen}
                  id="auto-pull-on-open"
                  onCheckedChange={(checked) => updateField("autoPullOnOpen", checked)}
                />
              </div>

              <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                <div className="space-y-1">
                  <Label htmlFor="auto-push-on-save">保存后自动推送</Label>
                  <p className="text-xs text-muted-foreground">
                    只有本地保存成功且达到最小间隔时才推送。
                  </p>
                </div>
                <Switch
                  checked={form.autoPushOnSave}
                  id="auto-push-on-save"
                  onCheckedChange={(checked) => updateField("autoPushOnSave", checked)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="auto-push-interval">自动推送最小间隔（秒）</Label>
                <Input
                  id="auto-push-interval"
                  min={30}
                  onChange={(event) =>
                    updateField(
                      "autoPushMinIntervalSeconds",
                      Number(event.currentTarget.value || 0)
                    )
                  }
                  type="number"
                  value={String(
                    Number.isFinite(form.autoPushMinIntervalSeconds)
                      ? form.autoPushMinIntervalSeconds
                      : 120
                  )}
                />
                <p className="text-xs text-muted-foreground">
                  最小值 30 秒，默认 120 秒。
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>手动同步</CardTitle>
              <CardDescription>
                当前项目
                {projectBound ? `：${getBaseName(projectState.projectPath!)}` : "：未打开"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={!projectBound || !hasSavedSyncConfig || actionsDisabled}
                  onClick={() => void handleManualPull()}
                  type="button"
                  variant="outline"
                >
                  <CloudDownload className="size-4" />
                  立即拉取
                </Button>
                <Button
                  disabled={!projectBound || !hasSavedSyncConfig || actionsDisabled}
                  onClick={() => void handleManualPush()}
                  type="button"
                  variant="outline"
                >
                  <CloudUpload className="size-4" />
                  立即推送
                </Button>
                <Button
                  disabled={syncState.isSettingsLoading || actionsDisabled}
                  onClick={() => void syncActions.reloadSyncSettings()}
                  type="button"
                  variant="ghost"
                >
                  <RefreshCcw className="size-4" />
                  重新载入设置
                </Button>
              </div>

              {!projectBound ? (
                <p className="text-xs text-muted-foreground">
                  先打开一个本地项目，才能执行拉取或推送。
                </p>
              ) : null}
            </CardContent>
          </Card>

          {saveFeedback ? (
            <Alert variant={saveFeedback === "设置已保存" ? "default" : "destructive"}>
              <AlertTitle>{saveFeedback === "设置已保存" ? "设置已更新" : "保存失败"}</AlertTitle>
              <AlertDescription>{saveFeedback}</AlertDescription>
            </Alert>
          ) : null}

          {syncState.lastResult ? (
            <Alert variant={syncState.lastResult.status === "error" ? "destructive" : "default"}>
              <AlertTitle>{syncState.lastResult.message}</AlertTitle>
              <AlertDescription>
                <div className="space-y-1">
                  {syncState.lastResult.changedPaths.length > 0 ? (
                    <p>已处理文件：{syncState.lastResult.changedPaths.length}</p>
                  ) : null}
                  {syncState.lastResult.changedDirectories.length > 0 ? (
                    <p>已处理目录：{syncState.lastResult.changedDirectories.length}</p>
                  ) : null}
                  {syncState.lastResult.conflicts.length > 0 ? (
                    <p>
                      未自动处理差异：{syncState.lastResult.conflicts.length} 项，
                      最近一项为“{getConflictLabel(syncState.lastResult.conflicts[0].reason)}”
                      ，路径 {syncState.lastResult.conflicts[0].path}
                    </p>
                  ) : null}
                  {syncState.lastResult.skippedDeletionPaths.length > 0 ? (
                    <p>删除差异待处理：{syncState.lastResult.skippedDeletionPaths.length} 项</p>
                  ) : null}
                </div>
              </AlertDescription>
            </Alert>
          ) : null}

          <DialogFooter>
            <Button
              disabled={actionsDisabled}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              关闭
            </Button>
            <Button disabled={actionsDisabled || !isDirty} type="submit">
              保存设置
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
