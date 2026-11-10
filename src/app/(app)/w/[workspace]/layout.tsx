import { Suspense, type ReactNode } from "react";
import { ShellSkeleton } from "@/modules/shell/components/shell-skeleton";
import { WorkspaceShell } from "@/modules/shell/components/workspace-shell";

export default function WorkspaceLayout({ children, params }: { children: ReactNode; params: Promise<{ workspace: string }> }) {
  // The session and workspace are only known per request, so the shell
  // streams in behind this boundary while the skeleton paints immediately.
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <WorkspaceShell params={params}>{children}</WorkspaceShell>
    </Suspense>
  );
}
