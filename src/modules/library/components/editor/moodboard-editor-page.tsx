import { workspacePath } from "@/modules/shell/navigation";
import { Skeleton } from "@/shared/ui/skeleton";
import { loadMoodboardPage } from "../../server/page-data";
import { getActiveProjects } from "../../server/queries";
import { MoodboardEditor } from "./moodboard-editor";

export async function MoodboardEditorPage({ params }: { params: Promise<{ workspace: string; moodboardId: string }> }) {
  const { workspace, moodboard } = await loadMoodboardPage(params);
  const projects = await getActiveProjects(workspace.id);
  const library = workspacePath(workspace.slug, "library");
  return (
    <MoodboardEditor
      // A different board (or a different saved version after a reload) starts a fresh editor.
      key={moodboard.id}
      board={moodboard}
      projects={projects}
      boardsHref={`${library}/moodboards`}
      libraryHref={library}
      projectsHref={workspacePath(workspace.slug, "projects")}
    />
  );
}

export function MoodboardEditorSkeleton() {
  return (
    <div role="status" aria-label="Loading moodboard" className="flex h-full flex-col">
      <div className="flex h-12 items-center gap-3 border-b border-line-subtle bg-surface px-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mx-auto h-6 w-72" />
      </div>
      <div className="flex-1 bg-[#0c0e11]" />
    </div>
  );
}
