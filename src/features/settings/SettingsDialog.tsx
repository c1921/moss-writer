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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
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
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { AppearanceSettings } from "@/app/appearanceSettings"
import { AppearancePanel } from "@/features/settings/AppearancePanel"
import type { WebDavSettings } from "@/features/settings/types"
import type {
  SyncLatestResolutionReason,
  SyncPendingItem,
  SyncResolveStrategy,
} from "@/features/sync/types"
import { getBaseName } from "@/shared/utils/fileNames"

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  appearance: AppearanceSettings
  onChangeAppearance: (s: AppearanceSettings) => void
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

function getPendingSubject(item: SyncPendingItem) {
  return item.entryType === "directory" ? "目录" : "文件"
}

function formatTimestamp(timestamp: number | null) {
  if (timestamp === null) {
    return "未知"
  }

  return new Date(timestamp).toLocaleString("zh-CN", {
    hour12: false,
  })
}

function getPendingTitle(item: SyncPendingItem) {
  const subject = getPendingSubject(item)

  switch (item.reason) {
    case "bothModified":
      return `本地和远端的${subject}都已变更`
    case "initialContentMismatch":
      return `同名${subject}在本地和远端都存在，但尚未建立同步基线且内容不同`
    case "localAhead":
      return `本地${subject}较新，远端仍保留旧版本`
    case "remoteAhead":
      return `远端${subject}较新，本地仍保留旧版本`
    case "localOnly":
      return `${subject}只存在于本地`
    case "remoteOnly":
      return `${subject}只存在于远端`
    case "localDeletedRemotePresent":
      return `本地已删除该${subject}，远端仍保留`
    case "remoteDeletedLocalPresent":
      return `远端已删除该${subject}，本地仍保留`
    default:
      return `该${subject}仍有待处理差异`
  }
}

function getLatestResolutionReasonLabel(reason: SyncLatestResolutionReason) {
  switch (reason) {
    case "localOnly":
      return "按较新判断会保留本地版本，因为只有本地存在"
    case "remoteOnly":
      return "按较新判断会保留远端版本，因为只有远端存在"
    case "localAhead":
      return "按较新判断会保留本地版本，因为只有本地相对同步基线有更新"
    case "remoteAhead":
      return "按较新判断会保留远端版本，因为只有远端相对同步基线有更新"
    case "localNewer":
      return "按较新判断会保留本地版本，因为本地修改时间更晚"
    case "remoteNewer":
      return "按较新判断会保留远端版本，因为远端修改时间更晚"
    case "localDeletionOnly":
      return "按较新判断会保留本地删除结果，因为远端保留的是旧版本"
    case "remoteDeletionOnly":
      return "按较新判断会保留远端删除结果，因为本地保留的是旧版本"
    case "timestampsEqual":
      return "按较新无法判断：本地和远端时间相同"
    case "missingTimestamp":
      return "按较新无法判断：缺少可比较的时间信息"
    case "deletionConflict":
      return "按较新无法判断：一边删除、另一边也有保留或修改"
    case "directoryDeletionConflict":
      return "按较新无法判断：目录删除差异需要你明确选择"
    default:
      return "按较新无法判断"
  }
}

function summarizePendingItems(pendingItems: SyncPendingItem[]) {
  return pendingItems.reduce(
    (summary, item) => {
      if (item.entryType === "file") {
        summary.fileCount += 1
      } else {
        summary.directoryCount += 1
      }

      if (item.latestResolution !== "undetermined") {
        summary.latestResolvableCount += 1
      } else {
        summary.latestUndeterminedCount += 1
      }

      return summary
    },
    {
      fileCount: 0,
      directoryCount: 0,
      latestResolvableCount: 0,
      latestUndeterminedCount: 0,
    }
  )
}

function summarizeResolvePlan(
  pendingItems: SyncPendingItem[],
  strategy: SyncResolveStrategy
) {
  return pendingItems.reduce(
    (summary, item) => {
      const resolution =
        strategy === "latest"
          ? item.latestResolution
          : strategy === "local"
            ? "local"
            : "remote"

      if (resolution === "undetermined") {
        summary.undeterminedCount += 1
        return summary
      }

      const winnerIsLocal = resolution === "local"
      const createOnTarget = winnerIsLocal
        ? item.localExists && !item.remoteExists
        : !item.localExists && item.remoteExists
      const deleteOnTarget = winnerIsLocal
        ? !item.localExists && item.remoteExists
        : item.localExists && !item.remoteExists
      const overwriteOnTarget = item.localExists && item.remoteExists

      if (item.entryType === "file") {
        if (createOnTarget) summary.createFiles += 1
        if (overwriteOnTarget) summary.overwriteFiles += 1
        if (deleteOnTarget) summary.deleteFiles += 1
      } else {
        if (createOnTarget) summary.createDirectories += 1
        if (deleteOnTarget) summary.deleteDirectories += 1
      }

      return summary
    },
    {
      createFiles: 0,
      overwriteFiles: 0,
      deleteFiles: 0,
      createDirectories: 0,
      deleteDirectories: 0,
      undeterminedCount: 0,
    }
  )
}

function getResolveStrategyTitle(strategy: SyncResolveStrategy) {
  switch (strategy) {
    case "latest":
      return "按较新一端覆盖"
    case "local":
      return "全部以本地为准"
    case "remote":
      return "全部以远端为准"
    default:
      return "批量处理差异"
  }
}

function getResolveStrategyDescription(strategy: SyncResolveStrategy) {
  switch (strategy) {
    case "latest":
      return "会把能明确判断较新的一端同步到另一端；无法判断的项会保留待处理。"
    case "local":
      return "会把本地当前状态同步到远端，远端可能被创建、覆盖或删除。"
    case "remote":
      return "会把远端当前状态同步到本地，本地可能被创建、覆盖或删除。"
    default:
      return "会按你选择的策略批量处理当前待处理差异。"
  }
}

function PlaceholderPanel({ title }: { title: string }) {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      {title}（即将推出）
    </div>
  )
}

export function SettingsDialog({ open, onOpenChange, appearance, onChangeAppearance }: SettingsDialogProps) {
  const projectState = useWriterProjectState()
  const syncState = useWriterSyncState()
  const syncActions = useWriterSyncActions()
  const [form, setForm] = useState<WebDavSettings>(syncState.settings)
  const [isSaving, setIsSaving] = useState(false)
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState("general")
  const [resolveStrategy, setResolveStrategy] = useState<SyncResolveStrategy | null>(null)

  useEffect(() => {
    if (open) {
      setForm(syncState.settings)
      setSaveFeedback(null)
      setActiveTab("general")
      setResolveStrategy(null)
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
  const pendingItems = syncState.lastResult?.pendingItems ?? []
  const pendingSummary = useMemo(
    () => summarizePendingItems(pendingItems),
    [pendingItems]
  )
  const latestPreview = useMemo(
    () => summarizeResolvePlan(pendingItems, "latest"),
    [pendingItems]
  )
  const currentResolvePreview = useMemo(
    () =>
      resolveStrategy === null ? null : summarizeResolvePlan(pendingItems, resolveStrategy),
    [pendingItems, resolveStrategy]
  )

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

  async function handleConfirmResolve() {
    if (!resolveStrategy) {
      return
    }

    try {
      if (isDirty) {
        await persistForm()
      }
    } catch {
      return
    }

    const strategy = resolveStrategy
    setResolveStrategy(null)
    await syncActions.resolveSyncPending(strategy)
  }

  return (
    <>
      <Dialog onOpenChange={onOpenChange} open={open}>
        <DialogContent className="flex h-[min(38rem,calc(100vh-3rem))] max-w-[min(52rem,calc(100%-1.5rem))] flex-col overflow-hidden p-0 sm:max-w-[52rem]">
          <form className="flex min-h-0 flex-1 flex-col gap-0" onSubmit={handleSubmit}>
          <DialogHeader className="shrink-0 px-6 pt-6 pb-4">
            <DialogTitle>设置</DialogTitle>
            <DialogDescription>
              配置 WebDAV 连接，并控制打开项目自动拉取，以及本地已落盘改动的自动推送。
            </DialogDescription>
          </DialogHeader>

          <Separator />

          <Tabs
            className="flex min-h-0 flex-1 flex-row gap-0"
            onValueChange={setActiveTab}
            orientation="vertical"
            value={activeTab}
          >
            <TabsList
              className="h-full w-40 shrink-0 flex-col justify-start gap-1 rounded-none border-none bg-transparent px-2 py-3"
              variant="line"
            >
              <TabsTrigger className="w-full justify-start px-3 py-2 text-sm" value="general">
                基本设置
              </TabsTrigger>
              <TabsTrigger className="w-full justify-start px-3 py-2 text-sm" value="editor">
                编辑器
              </TabsTrigger>
              <TabsTrigger className="w-full justify-start px-3 py-2 text-sm" value="appearance">
                外观
              </TabsTrigger>
              <TabsTrigger className="w-full justify-start px-3 py-2 text-sm" value="git">
                Git
              </TabsTrigger>
              <TabsTrigger className="w-full justify-start px-3 py-2 text-sm" value="shortcuts">
                快捷键
              </TabsTrigger>
              <Separator className="my-1" />
              <TabsTrigger className="w-full justify-start px-3 py-2 text-sm" value="webdav">
                WebDAV
              </TabsTrigger>
            </TabsList>

            <Separator orientation="vertical" />

            <div className="min-h-0 flex-1 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="px-6 py-4">
                  <TabsContent value="general">
                    <PlaceholderPanel title="基本设置" />
                  </TabsContent>

                  <TabsContent value="editor">
                    <PlaceholderPanel title="编辑器" />
                  </TabsContent>

                  <TabsContent value="appearance">
                    <AppearancePanel
                      onChangeSettings={onChangeAppearance}
                      settings={appearance}
                    />
                  </TabsContent>

                  <TabsContent value="git">
                    <PlaceholderPanel title="Git" />
                  </TabsContent>

                  <TabsContent value="shortcuts">
                    <PlaceholderPanel title="快捷键" />
                  </TabsContent>

                  <TabsContent className="space-y-4" value="webdav">
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
                          打开项目自动拉取；只要存在本地已落盘改动，到达最小时间间隔后就会自动推送。
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
                            <Label htmlFor="auto-push-on-save">自动推送本地改动</Label>
                            <p className="text-xs text-muted-foreground">
                              已写入本地文件的改动会在达到最小间隔后自动推送，不包含尚未保存的编辑内容。
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
                          <div className="space-y-3">
                            {syncState.lastResult.changedPaths.length > 0 ? (
                              <p>本地已更新文件：{syncState.lastResult.changedPaths.length}</p>
                            ) : null}
                            {syncState.lastResult.changedDirectories.length > 0 ? (
                              <p>本地已更新目录：{syncState.lastResult.changedDirectories.length}</p>
                            ) : null}

                            {pendingItems.length > 0 ? (
                              <div className="space-y-3 rounded-lg border bg-background/60 p-3">
                                <div className="space-y-1">
                                  <p className="font-medium text-foreground">待处理差异</p>
                                  <p>
                                    共 {pendingItems.length} 项，其中包含文件 {pendingSummary.fileCount} 项、
                                    目录 {pendingSummary.directoryCount} 项。
                                  </p>
                                  <p>
                                    按较新一端可直接判断 {pendingSummary.latestResolvableCount} 项，
                                    仍有 {pendingSummary.latestUndeterminedCount} 项需要你明确选择本地或远端。
                                  </p>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                  <Button
                                    disabled={
                                      !projectBound ||
                                      !hasSavedSyncConfig ||
                                      actionsDisabled ||
                                      latestPreview.undeterminedCount === pendingItems.length
                                    }
                                    onClick={() => setResolveStrategy("latest")}
                                    type="button"
                                    variant="outline"
                                  >
                                    按较新一端覆盖
                                  </Button>
                                  <Button
                                    disabled={!projectBound || !hasSavedSyncConfig || actionsDisabled}
                                    onClick={() => setResolveStrategy("local")}
                                    type="button"
                                    variant="outline"
                                  >
                                    全部以本地为准
                                  </Button>
                                  <Button
                                    disabled={!projectBound || !hasSavedSyncConfig || actionsDisabled}
                                    onClick={() => setResolveStrategy("remote")}
                                    type="button"
                                    variant="outline"
                                  >
                                    全部以远端为准
                                  </Button>
                                </div>

                                <div className="space-y-2">
                                  {pendingItems.map((item) => (
                                    <div
                                      className="rounded-md border bg-muted/30 px-3 py-2"
                                      key={`${item.entryType}:${item.path}`}
                                    >
                                      <p className="font-medium text-foreground">{item.path}</p>
                                      <p>{getPendingTitle(item)}</p>
                                      <p>{getLatestResolutionReasonLabel(item.latestResolutionReason)}</p>
                                      <p>
                                        本地时间：{formatTimestamp(item.localModifiedAt)}；远端时间：
                                        {formatTimestamp(item.remoteModifiedAt)}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : syncState.lastResult.skippedDeletionPaths.length > 0 ? (
                              <p>仍有删除差异待处理：{syncState.lastResult.skippedDeletionPaths.length} 项</p>
                            ) : null}
                          </div>
                        </AlertDescription>
                      </Alert>
                    ) : null}
                  </TabsContent>
                </div>
              </ScrollArea>
            </div>
          </Tabs>

          <Separator />

            <DialogFooter className="mx-0 mb-0 shrink-0 px-6 py-4">
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

      <AlertDialog
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setResolveStrategy(null)
          }
        }}
        open={resolveStrategy !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {resolveStrategy ? getResolveStrategyTitle(resolveStrategy) : "批量处理差异"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              <div className="space-y-2">
                <p>
                  {resolveStrategy
                    ? getResolveStrategyDescription(resolveStrategy)
                    : "会按你选择的策略处理当前待处理差异。"}
                </p>
                {currentResolvePreview ? (
                  <div className="space-y-1">
                    <p>创建文件：{currentResolvePreview.createFiles}</p>
                    <p>覆盖文件：{currentResolvePreview.overwriteFiles}</p>
                    <p>删除文件：{currentResolvePreview.deleteFiles}</p>
                    <p>创建目录：{currentResolvePreview.createDirectories}</p>
                    <p>删除目录：{currentResolvePreview.deleteDirectories}</p>
                    {resolveStrategy === "latest" ? (
                      <p>仍无法按较新判断：{currentResolvePreview.undeterminedCount}</p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionsDisabled}>取消</AlertDialogCancel>
            <AlertDialogAction disabled={actionsDisabled} onClick={() => void handleConfirmResolve()}>
              确认处理
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
