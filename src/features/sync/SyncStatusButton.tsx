import {
  CloudAlert,
  CloudCog,
  CloudDownload,
  CloudUpload,
  LoaderCircle,
} from "lucide-react"

import { useWriterSyncState } from "@/app/WriterAppContext"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface SyncStatusButtonProps {
  onClick: () => void
}

function getSyncLabel({
  isSettingsLoading,
  isSyncing,
  activeDirection,
  settingsEnabled,
  lastMessage,
}: {
  isSettingsLoading: boolean
  isSyncing: boolean
  activeDirection: "pull" | "push" | "test" | null
  settingsEnabled: boolean
  lastMessage: string | null
}) {
  if (isSettingsLoading) {
    return "读取同步设置"
  }

  if (isSyncing && activeDirection === "pull") {
    return "正在拉取"
  }

  if (isSyncing && activeDirection === "push") {
    return "正在推送"
  }

  if (isSyncing && activeDirection === "test") {
    return "正在测试连接"
  }

  if (!settingsEnabled) {
    return "配置 WebDAV"
  }

  return lastMessage ?? "WebDAV 已启用"
}

export function SyncStatusButton({ onClick }: SyncStatusButtonProps) {
  const syncState = useWriterSyncState()
  const lastStatus = syncState.lastResult?.status ?? null
  const label = getSyncLabel({
    isSettingsLoading: syncState.isSettingsLoading,
    isSyncing: syncState.isSyncing,
    activeDirection: syncState.activeDirection,
    settingsEnabled: syncState.settings.enabled,
    lastMessage: syncState.lastResult?.message ?? null,
  })

  const Icon = syncState.isSyncing
    ? LoaderCircle
    : syncState.activeDirection === "pull"
      ? CloudDownload
      : syncState.activeDirection === "push"
        ? CloudUpload
        : lastStatus === "warning" || lastStatus === "error"
          ? CloudAlert
          : CloudCog

  return (
    <Button
      className={cn(
        "max-w-52 justify-start gap-2 px-2",
        lastStatus === "warning" && "text-amber-700 dark:text-amber-300",
        lastStatus === "error" && "text-destructive"
      )}
      onClick={onClick}
      size="sm"
      type="button"
      variant="ghost"
    >
      <Icon className={cn("size-4 shrink-0", syncState.isSyncing && "animate-spin")} />
      <span className="truncate text-xs">{label}</span>
    </Button>
  )
}
