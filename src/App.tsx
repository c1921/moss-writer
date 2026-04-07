import { useState } from "react";
import { TriangleAlert } from "lucide-react";

import {
  WriterAppProvider,
  useWriterAppActions,
  useWriterAppError,
} from "@/app/WriterAppContext";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { EditorCurrentFileName } from "@/features/editor/EditorCurrentFileName";
import { EditorPane } from "@/features/editor/EditorPane";
import { EditorSaveStatusBadge } from "@/features/editor/EditorSaveStatusBadge";
import { FileSidebar } from "@/features/fileManager/FileSidebar";
import { SettingsDialog } from "@/features/settings/SettingsDialog";
import { SyncStatusButton } from "@/features/sync/SyncStatusButton";

function AppShell() {
  const appError = useWriterAppError();
  const { clearError } = useWriterAppActions();
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <SidebarProvider>
      <FileSidebar onOpenSettings={() => setSettingsOpen(true)} />
      <SidebarInset>
        <header className="flex h-10 shrink-0 items-center gap-2 border-b px-3">
          <SidebarTrigger className="shrink-0" />
          <div className="min-w-0 flex-1">
            <EditorCurrentFileName />
          </div>
          <SyncStatusButton onClick={() => setSettingsOpen(true)} />
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
        <EditorPane />
        <SettingsDialog onOpenChange={setSettingsOpen} open={settingsOpen} />
      </SidebarInset>
    </SidebarProvider>
  );
}

export default function App() {
  return (
    <WriterAppProvider>
      <AppShell />
    </WriterAppProvider>
  );
}
