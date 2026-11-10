import { LayoutPanelLeft } from "lucide-react";
import { workspacePath } from "@/modules/shell/navigation";
import { EmptyState } from "@/shared/ui/empty-state";
import { PageContainer, PageHeader } from "@/shared/ui/page";
import { Skeleton } from "@/shared/ui/skeleton";
import { Surface } from "@/shared/ui/surface";
import { loadLibraryWorkspace } from "../server/page-data";
import { getActiveProjects, getCollectionChoices, getLibraryCounts, getMoodboards } from "../server/queries";
import { LibraryTabs } from "./library-tabs";
import { MoodboardGrid, NewMoodboardButton } from "./moodboard-cards";

export async function MoodboardsView({
  params,
  searchParams,
}: {
  params: Promise<{ workspace: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { workspace } = await loadLibraryWorkspace(params);
  const raw = await searchParams;
  const [boards, projects, counts, collections] = await Promise.all([
    getMoodboards(workspace.id),
    getActiveProjects(workspace.id),
    getLibraryCounts(workspace.id),
    getCollectionChoices(workspace.id),
  ]);
  const base = workspacePath(workspace.slug, "library");
  const boardsHref = `${base}/moodboards`;

  return (
    <PageContainer width="wide" className="flex animate-fade-in flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader eyebrow="Visual Library" title="Moodboards" description="Freeform canvases for arranging references, notes and direction." />
        <NewMoodboardButton workspaceId={workspace.id} boardsHref={boardsHref} projects={projects} autoOpen={raw.new === "1"} />
      </div>
      <LibraryTabs base={base} counts={{ references: counts.total, collections: collections.length, moodboards: boards.length }} />
      {boards.length === 0 ? (
        <Surface>
          <EmptyState
            icon={<LayoutPanelLeft aria-hidden className="size-4" />}
            title="No moodboards yet"
            description="Start a board, then drag references from the library onto an open canvas. Move, resize, layer and annotate them; the layout is saved as you work."
            action={<NewMoodboardButton workspaceId={workspace.id} boardsHref={boardsHref} projects={projects} label="Create your first moodboard" />}
          />
        </Surface>
      ) : (
        <MoodboardGrid boards={boards} boardsHref={boardsHref} projects={projects} />
      )}
    </PageContainer>
  );
}

export function MoodboardsSkeleton() {
  return (
    <PageContainer width="wide" className="flex flex-col gap-6">
      <div className="flex flex-col gap-3" role="status" aria-label="Loading moodboards">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-7 w-44" />
      </div>
      <Skeleton className="h-9 w-full" />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-5">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="aspect-[16/10] w-full rounded-lg" />
        ))}
      </div>
    </PageContainer>
  );
}
