import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { getMyWorkspaces, getWorkspaceContext } from "@/modules/workspaces/server/queries";
import { ShellFrame } from "./shell-frame";

/**
 * Server entry point for everything under /w/[workspace]. Authorises the
 * workspace for the signed-in user before any child content renders.
 */
export async function WorkspaceShell({ params, children }: { params: Promise<{ workspace: string }>; children: ReactNode }) {
  const { workspace: slug } = await params;
  const context = await getWorkspaceContext(slug);
  if (!context) notFound();
  const { workspaces } = await getMyWorkspaces();

  return (
    <ShellFrame user={{ name: context.user.name, email: context.user.email }} workspace={context.workspace} workspaces={workspaces}>
      {children}
    </ShellFrame>
  );
}
