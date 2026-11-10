import Link from "next/link";
import { FolderKanban, Plus } from "lucide-react";
import { workspacePath } from "@/modules/shell/navigation";
import { Button } from "@/shared/ui/button";
import { EmptyState } from "@/shared/ui/empty-state";
import { LocalDate } from "@/shared/ui/local-date";
import { Surface } from "@/shared/ui/surface";
import { getRecentProjects } from "../server/queries";
import { StatusBadge } from "./badges";

/** The Overview's "Recent work": the most recently updated live projects. */
export async function RecentProjects({ workspaceId, workspaceSlug }: { workspaceId: string; workspaceSlug: string }) {
  const projects = await getRecentProjects(workspaceId);

  if (projects.length === 0) {
    return (
      <Surface>
        <EmptyState
          icon={<FolderKanban aria-hidden className="size-4" />}
          title="No projects yet"
          description="Your most recently updated projects will appear here."
          action={
            <Button asChild variant="primary">
              <Link href={`${workspacePath(workspaceSlug, "projects")}?new=1`}>
                <Plus aria-hidden className="size-4" />
                Create a project
              </Link>
            </Button>
          }
        />
      </Surface>
    );
  }

  return (
    <Surface>
      <ul aria-label="Recently updated projects" className="divide-y divide-line-subtle">
        {projects.map((project) => (
          <li key={project.id}>
            <Link
              href={workspacePath(workspaceSlug, "projects", project.id)}
              className="flex items-center justify-between gap-4 px-4 py-3 transition-colors duration-150 hover:bg-hover focus-visible:-outline-offset-2"
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[0.8125rem] font-medium text-fg">{project.name}</span>
                <span className="truncate text-xs text-fg-faint">
                  Updated <LocalDate value={project.updatedAt.toISOString()} options={{ day: "numeric", month: "short" }} />
                </span>
              </span>
              <StatusBadge status={project.status} className="shrink-0" />
            </Link>
          </li>
        ))}
      </ul>
      <p className="border-t border-line-subtle px-4 py-2.5 text-xs">
        <Link href={workspacePath(workspaceSlug, "projects")} className="text-fg-muted transition-colors hover:text-fg">
          View all projects
        </Link>
      </p>
    </Surface>
  );
}
