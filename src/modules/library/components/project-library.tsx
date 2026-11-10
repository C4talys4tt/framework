import { ImagePlus, LayoutPanelLeft, SearchX } from "lucide-react";
import { loadProjectPage } from "@/modules/projects/server/page-data";
import { workspacePath } from "@/modules/shell/navigation";
import { EmptyState } from "@/shared/ui/empty-state";
import { Surface } from "@/shared/ui/surface";
import { filtersKey, parseLibraryFilters } from "../domain/reference";
import { getActiveProjects, getCollectionChoices, getLibraryPage, getLibraryTags, getMoodboards } from "../server/queries";
import { MoodboardGrid, NewMoodboardButton } from "./moodboard-cards";
import { ProjectReferenceActions, ProjectReferenceBrowser } from "./project-library-parts";

type Params = Promise<{ workspace: string; projectId: string }>;

/** A project's References tab: the library, narrowed to what is linked to this project. */
export async function ProjectReferences({ params, searchParams }: { params: Params; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { workspace, project } = await loadProjectPage(params);
  const archived = project.archivedAt !== null;
  const filters = parseLibraryFilters(await searchParams);
  const [page, tags, collections, projects] = await Promise.all([
    getLibraryPage(workspace.id, filters, { projectId: project.id }),
    getLibraryTags(workspace.id),
    getCollectionChoices(workspace.id),
    getActiveProjects(workspace.id),
  ]);
  const actions = archived ? null : <ProjectReferenceActions workspaceId={workspace.id} projectId={project.id} projectName={project.name} />;

  return (
    <div className="flex flex-col gap-4">
      {actions && (page.total ?? 0) > 0 ? <div className="flex justify-end">{actions}</div> : null}
      <ProjectReferenceBrowser
        archived={archived}
        scope={{ workspaceId: workspace.id, workspaceSlug: workspace.slug, projectId: project.id }}
        filters={filters}
        filtersKey={filtersKey(filters)}
        initial={page}
        tags={tags}
        collections={collections}
        projects={projects}
        empty={
          <Surface>
            <EmptyState
              icon={<ImagePlus aria-hidden className="size-4" />}
              title="No references for this project yet"
              description={
                archived
                  ? "This project is archived, so its references cannot change."
                  : "Link references from the Visual Library, or upload new ones straight into this project. A reference can belong to several projects without being copied."
              }
              action={actions}
            />
          </Surface>
        }
        noMatches={
          <Surface>
            <EmptyState icon={<SearchX aria-hidden className="size-4" />} title="No references match" description="Try a different search or fewer tags." />
          </Surface>
        }
      />
    </div>
  );
}

/** A project's Moodboards tab. */
export async function ProjectMoodboards({ params }: { params: Params }) {
  const { workspace, project } = await loadProjectPage(params);
  const archived = project.archivedAt !== null;
  const [boards, projects] = await Promise.all([getMoodboards(workspace.id, { projectId: project.id }), getActiveProjects(workspace.id)]);
  const boardsHref = workspacePath(workspace.slug, "library", "moodboards");
  const create = archived ? null : <NewMoodboardButton workspaceId={workspace.id} boardsHref={boardsHref} projects={projects} projectId={project.id} />;

  return (
    <div className="flex flex-col gap-4">
      {boards.length === 0 ? (
        <Surface>
          <EmptyState
            icon={<LayoutPanelLeft aria-hidden className="size-4" />}
            title="No moodboards for this project"
            description={archived ? "This project is archived, so no boards can be added to it." : "Create a board for a look, a sequence or a pitch. A project can have as many as it needs."}
            action={create}
          />
        </Surface>
      ) : (
        <>
          {create ? <div className="flex justify-end">{create}</div> : null}
          <MoodboardGrid boards={boards} boardsHref={boardsHref} projects={projects} />
        </>
      )}
    </div>
  );
}
