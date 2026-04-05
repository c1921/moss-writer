import { TriangleAlert } from "lucide-react";

import {
  WriterAppProvider,
  useWriterAppActions,
  useWriterAppError,
} from "@/app/WriterAppContext";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { EditorPane } from "@/features/editor/EditorPane";
import { FileSidebar } from "@/features/fileManager/FileSidebar";

function AppShell() {
  const appError = useWriterAppError();
  const { clearError } = useWriterAppActions();

  return (
    <SidebarProvider>
      <FileSidebar />
      <SidebarInset>
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
