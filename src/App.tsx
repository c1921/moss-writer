import { TriangleAlert } from "lucide-react";

import { WriterAppProvider, useWriterApp } from "@/app/WriterAppContext";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EditorPane } from "@/features/editor/EditorPane";
import { FileSidebar } from "@/features/fileManager/FileSidebar";

function AppShell() {
  const { state, clearError } = useWriterApp();

  return (
    <main className="min-h-screen bg-muted/30 p-4 lg:p-6">
      <div className="mx-auto grid min-h-[calc(100svh-2rem)] max-w-[1600px] gap-4 lg:min-h-[calc(100svh-3rem)] lg:grid-cols-[320px_minmax(0,1fr)]">
        <FileSidebar />

        <div className="flex min-w-0 flex-col gap-4">
          {state.appError ? (
            <Alert
              className="border-destructive/30 bg-destructive/5 text-destructive"
              variant="destructive"
            >
              <TriangleAlert className="size-4" />
              <AlertTitle>操作失败</AlertTitle>
              <AlertDescription>{state.appError}</AlertDescription>
              <AlertAction>
                <Button onClick={clearError} size="sm" type="button" variant="ghost">
                  关闭
                </Button>
              </AlertAction>
            </Alert>
          ) : null}

          <EditorPane />
        </div>
      </div>
    </main>
  );
}

export default function App() {
  return (
    <WriterAppProvider>
      <AppShell />
    </WriterAppProvider>
  );
}
