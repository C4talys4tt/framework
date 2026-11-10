import Link from "next/link";
import { ChevronLeft, ChevronRight, MessageSquareText } from "lucide-react";
import { workspacePath } from "@/modules/shell/navigation";
import { Button } from "@/shared/ui/button";
import { LocalDate } from "@/shared/ui/local-date";
import { Surface } from "@/shared/ui/surface";
import { filtersToQuery, pageCount, type ProjectFilters, type ProjectListItem } from "../domain/project";
import { CategoryLabel, PriorityLabel, StatusBadge } from "./badges";
import { DueDate } from "./due-date";

const COLUMNS = "md:grid-cols-[minmax(0,1fr)_9.5rem_9.5rem_5.5rem]";

export function ProjectList({ workspaceSlug, projects }: { workspaceSlug: string; projects: ProjectListItem[] }) {
  return (
    <Surface className="overflow-hidden">
      <div aria-hidden className={`hidden gap-x-4 border-b border-line-subtle px-4 py-2 text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-fg-faint md:grid ${COLUMNS}`}>
        <span>Project</span>
        <span>Status</span>
        <span>Due</span>
        <span className="text-right">Updated</span>
      </div>
      <ul aria-label="Projects">
        {projects.map((project) => (
          <li key={project.id} className="border-t border-line-subtle first:border-t-0 md:first:border-t-0">
            <Link
              href={workspacePath(workspaceSlug, "projects", project.id)}
              className={`group grid items-center gap-x-4 gap-y-2 px-4 py-3 transition-colors duration-150 hover:bg-hover focus-visible:-outline-offset-2 ${COLUMNS}`}
            >
              <div className="flex min-w-0 flex-col gap-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-fg">{project.name}</span>
                  {project.archivedAt ? (
                    <span className="shrink-0 rounded-xs border border-line px-1.5 font-mono text-[0.625rem] uppercase tracking-[0.08em] text-fg-faint">
                      Archived
                    </span>
                  ) : null}
                </span>
                <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  {project.client ? <span className="truncate text-fg-muted">{project.client}</span> : null}
                  {project.category ? <CategoryLabel category={project.category} /> : null}
                  <PriorityLabel priority={project.priority} />
                  {project.noteCount > 0 ? (
                    <span className="inline-flex items-center gap-1 text-fg-faint">
                      <MessageSquareText aria-hidden className="size-3" />
                      {project.noteCount}
                      <span className="sr-only"> {project.noteCount === 1 ? "note" : "notes"}</span>
                    </span>
                  ) : null}
                  {project.tags.length > 0 ? (
                    <span className="truncate text-fg-faint">{project.tags.map((tag) => `#${tag}`).join(" ")}</span>
                  ) : null}
                </span>
              </div>
              <div className="flex md:block">
                <StatusBadge status={project.status} />
              </div>
              <div className="text-[0.8125rem] text-fg-muted">
                <span className="mr-2 text-xs text-fg-faint md:hidden">Due</span>
                <DueDate dueDate={project.dueDate} statusKind={project.status.kind} archived={project.archivedAt !== null} />
              </div>
              <div className="hidden text-right text-xs text-fg-faint md:block">
                <LocalDate value={project.updatedAt.toISOString()} options={{ day: "numeric", month: "short" }} />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </Surface>
  );
}

export function Pagination({ workspaceSlug, filters, total }: { workspaceSlug: string; filters: ProjectFilters; total: number }) {
  const pages = pageCount(total);
  if (pages <= 1) return null;
  const href = (page: number) => `${workspacePath(workspaceSlug, "projects")}${filtersToQuery({ ...filters, page })}`;
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-4 text-[0.8125rem] text-fg-muted">
      <span>
        Page {filters.page} of {pages}
      </span>
      <div className="flex gap-2">
        {filters.page > 1 ? (
          <Button asChild size="sm">
            <Link href={href(filters.page - 1)} rel="prev">
              <ChevronLeft aria-hidden className="size-3.5" />
              Previous
            </Link>
          </Button>
        ) : null}
        {filters.page < pages ? (
          <Button asChild size="sm">
            <Link href={href(filters.page + 1)} rel="next">
              Next
              <ChevronRight aria-hidden className="size-3.5" />
            </Link>
          </Button>
        ) : null}
      </div>
    </nav>
  );
}
