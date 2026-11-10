import "server-only";
import { notFound } from "next/navigation";
import { getWorkspaceContext } from "@/modules/workspaces/server/queries";
import { getProjectById } from "./queries";

/**
 * Resolves `/w/[workspace]/projects/[projectId]`. The project must exist, be
 * visible to the user, AND belong to the workspace in the URL: a project from
 * another of the user's workspaces is "not found" here too.
 */
export async function loadProjectPage(params: Promise<{ workspace: string; projectId: string }>) {
  const { workspace: slug, projectId } = await params;
  const context = await getWorkspaceContext(slug);
  if (!context) notFound();
  const project = await getProjectById(projectId);
  if (!project || project.workspaceId !== context.workspace.id) notFound();
  return { ...context, project };
}
