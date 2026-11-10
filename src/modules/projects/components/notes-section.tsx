import { loadProjectPage } from "../server/page-data";
import { getProjectNotes } from "../server/queries";
import { canManageWorkspace } from "@/modules/workspaces/domain/workspace";
import { NotesPanel } from "./notes-panel";

export async function NotesSection({ params }: { params: Promise<{ workspace: string; projectId: string }> }) {
  const { user, workspace, project } = await loadProjectPage(params);
  const notes = await getProjectNotes(workspace.id, project.id);
  return (
    <NotesPanel
      projectId={project.id}
      notes={notes}
      viewer={{ userId: user.id, isOwner: canManageWorkspace(workspace.role) }}
      archived={project.archivedAt !== null}
    />
  );
}
