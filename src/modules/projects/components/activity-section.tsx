import { loadProjectPage } from "../server/page-data";
import { getProjectActivity } from "../server/queries";
import { ActivityTimeline } from "./activity-timeline";

export async function ActivitySection({ params }: { params: Promise<{ workspace: string; projectId: string }> }) {
  const { workspace, project } = await loadProjectPage(params);
  const { entries, hasMore } = await getProjectActivity(workspace.id, project.id);
  return <ActivityTimeline projectId={project.id} initial={entries} hasMore={hasMore} />;
}
