import { useState, type MouseEvent } from "react";
import { Expand, Minimize2, TriangleAlert } from "lucide-react";

import {
  WriterAppProvider,
  useWriterAppActions,
  useWriterAppError,
} from "@/app/WriterAppContext";
import { useMiniWindowMode } from "@/app/hooks/useMiniWindowMode";
import { useAppearanceSettings } from "@/app/hooks/useAppearanceSettings";
import type { AppearanceSettings } from "@/app/appearanceSettings";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { EditorCurrentFileName } from "@/features/editor/EditorCurrentFileName";
import { EditorPane } from "@/features/editor/EditorPane";
import { EditorSaveStatusBadge } from "@/features/editor/EditorSaveStatusBadge";
import { FileSidebar } from "@/features/fileManager/FileSidebar";
import { SettingsDialog } from "@/features/settings/SettingsDialog";
import { SyncStatusButton } from "@/features/sync/SyncStatusButton";

function isInteractiveTarget(target: HTMLElement | null) {
  if (!target) {
    return false;
  }

  return Boolean(target.closest("button, input, textarea, a, [role='button'], [data-no-drag='true']"));
}

interface StandardWorkspaceProps {
  appError: string | null;
  clearError: () => void;
  onEnterMiniWindowMode: () => void;
  onOpenSettings: () => void;
  mainEditorFontSizePx: number;
}

function StandardWorkspace({
  appError,
  clearError,
  onEnterMiniWindowMode,
  onOpenSettings,
  mainEditorFontSizePx,
}: StandardWorkspaceProps) {
  return (
    <div className="min-h-svh bg-background">
      <SidebarProvider>
        <FileSidebar onOpenSettings={onOpenSettings} />
        <SidebarInset>
          <header className="flex h-10 shrink-0 items-center gap-2 border-b px-3">
            <SidebarTrigger className="shrink-0" />
            <div className="min-w-0 flex-1">
              <EditorCurrentFileName />
            </div>
            <Button onClick={onEnterMiniWindowMode} size="sm" type="button" variant="ghost">
              <Minimize2 className="size-4" />
              小窗
            </Button>
            <SyncStatusButton onClick={onOpenSettings} />
            <EditorSaveStatusBadge className="shrink-0" />
          </header>
          {appError ? (
            <div className="p-4 pb-0">
              <Alert
                className="border-destructive/30 bg-destructive/5 text-destructive"
                variant="destructive"
              >
                <TriangleAlert className="size-4" />
                <AlertTitle>操作失败</AlertTitle>
                <AlertDescription>{appError}</AlertDescription>
                <AlertAction>
                  <Button onClick={clearError} size="sm" type="button" variant="ghost">
                    关闭
                  </Button>
                </AlertAction>
              </Alert>
            </div>
          ) : null}
          <EditorPane fontSizePx={mainEditorFontSizePx} />
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}

interface MiniWindowWorkspaceProps {
  onExitMiniWindowMode: () => void;
  onOpenSettings: () => void;
  onStartDragging: () => void;
  appearance: AppearanceSettings;
}

function MiniWindowWorkspace({
  onExitMiniWindowMode,
  onOpenSettings,
  onStartDragging,
  appearance,
}: MiniWindowWorkspaceProps) {
  function handleDragStart(event: MouseEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return;
    }

    if (isInteractiveTarget(event.target as HTMLElement | null)) {
      return;
    }

    void onStartDragging();
  }

  return (
    <div className="h-svh bg-transparent" data-testid="mini-window-workspace">
      <section
        className="flex h-full flex-col overflow-hidden backdrop-blur-2xl"
        style={{
          backgroundColor: `color-mix(in oklch, var(--color-background) ${appearance.miniWindowOpacity}%, transparent)`,
        }}
      >
        <header
          className="flex min-h-9 items-center gap-2 border-b border-border/40 px-3 py-2"
          data-testid="mini-window-drag-bar"
          onMouseDown={handleDragStart}
        >
          <div className="flex min-w-0 flex-1 items-center gap-2 px-1">
            {appearance.miniWindowShowStatusBar && (
              <>
                <SyncStatusButton compact onClick={onOpenSettings} />
                <EditorSaveStatusBadge
                  className="shrink-0"
                  compact
                  showUnavailable
                />
              </>
            )}
          </div>
          <Button
            aria-label="退出小窗模式"
            data-no-drag="true"
            onClick={onExitMiniWindowMode}
            size="icon-xs"
            type="button"
            variant="outline"
          >
            <Expand className="size-3.5" />
          </Button>
        </header>
        <div className="flex flex-1 pt-2">
          <EditorPane fontSizePx={appearance.miniEditorFontSize} variant="mini" />
        </div>
      </section>
    </div>
  );
}

function AppShell() {
  const appError = useWriterAppError();
  const { clearError } = useWriterAppActions();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const {
    isMiniWindowMode,
    enterMiniWindowMode,
    exitMiniWindowMode,
    startWindowDragging,
  } = useMiniWindowMode();
  const { settings: appearance, updateSettings: updateAppearance } = useAppearanceSettings();

  async function handleEnterMiniWindowMode() {
    setSettingsOpen(false);
    await enterMiniWindowMode();
  }

  async function handleOpenSettings() {
    if (isMiniWindowMode) {
      await exitMiniWindowMode();
    }

    setSettingsOpen(true);
  }

  return (
    <>
      {isMiniWindowMode ? (
        <MiniWindowWorkspace
          appearance={appearance}
          onExitMiniWindowMode={() => void exitMiniWindowMode()}
          onOpenSettings={() => void handleOpenSettings()}
          onStartDragging={() => void startWindowDragging()}
        />
      ) : (
        <StandardWorkspace
          appError={appError}
          clearError={clearError}
          mainEditorFontSizePx={appearance.mainEditorFontSize}
          onEnterMiniWindowMode={() => void handleEnterMiniWindowMode()}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      )}
      <SettingsDialog
        appearance={appearance}
        onChangeAppearance={updateAppearance}
        onOpenChange={setSettingsOpen}
        open={settingsOpen}
      />
    </>
  );
}

export default function App() {
  return (
    <WriterAppProvider>
      <AppShell />
    </WriterAppProvider>
  );
}
