import Link from "next/link";
import { ArrowLeft, Archive } from "lucide-react";
import { workspacePath } from "@/modules/shell/navigation";
import { LocalDate } from "@/shared/ui/local-date";
import { PageContainer } from "@/shared/ui/page";
import { Skeleton } from "@/shared/ui/skeleton";
import { loadProjectPage } from "../server/page-data";
import { getProjectOptions } from "../server/queries";
import { CategoryLabel, PriorityLabel } from "./badges";
import { ProjectActions, StatusMenu } from "./project-actions";
import { ProjectTabs } from "./project-tabs";
import type { ReactNode } from "react";

/** Header, status, tags and tabs shared by every project page. */
export async function ProjectFrame({
  params,
  children,
}: {
  params: Promise<{ workspace: string; projectId: string }>;
  children: ReactNode;
}) {
  const { workspace, project } = await loadProjectPage(params);
  const options = await getProjectOptions(workspace.id);
  const archived = project.archivedAt !== null;
  const base = workspacePath(workspace.slug, "projects", project.id);

  return (
    <PageContainer className="flex animate-fade-in flex-col gap-6">
      <div className="flex flex-col gap-4">
        <Link
          href={workspacePath(workspace.slug, "projects")}
          className="inline-flex w-fit items-center gap-1.5 text-[0.8125rem] text-fg-muted transition-colors hover:text-fg"
        >
          <ArrowLeft aria-hidden className="size-3.5" />
          Projects
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-3">
            <h1 className="break-words text-2xl font-semibold tracking-[-0.02em] text-fg">{project.name}</h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[0.8125rem]">
              <StatusMenu project={project} statuses={options.statuses} />
              {project.category ? <CategoryLabel category={project.category} /> : null}
              <PriorityLabel priority={project.priority} />
              {project.client ? <span className="text-fg-muted">{project.client}</span> : null}
            </div>
            {project.tags.length > 0 ? (
              <ul aria-label="Tags" className="flex flex-wrap gap-1.5">
                {project.tags.map((tag) => (
                  <li key={tag}>
                    <Link
                      href={`${workspacePath(workspace.slug, "projects")}?tag=${encodeURIComponent(tag)}&view=all`}
                      className="inline-flex h-5 items-center rounded-xs border border-line px-1.5 text-xs text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
                    >
                      {tag}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <ProjectActions
            project={project}
            statuses={options.statuses}
            categories={options.categories}
            tagSuggestions={options.tags.map((tag) => tag.name)}
          />
        </div>

        {archived ? (
          <div role="status" className="flex items-start gap-3 rounded-md border border-line bg-surface px-4 py-3 text-[0.8125rem] text-fg-muted">
            <Archive aria-hidden className="mt-0.5 size-4 shrink-0 text-fg-faint" />
            <p>
              This project was archived
              {project.archivedAt ? (
                <>
                  {" "}
                  on <LocalDate value={project.archivedAt.toISOString()} options={{ day: "numeric", month: "long", year: "numeric" }} />
                </>
              ) : null}
              {project.archivedByName ? ` by ${project.archivedByName}` : ""}. It is read-only until you restore it.
            </p>
          </div>
        ) : null}
      </div>

      <ProjectTabs base={base} noteCount={project.noteCount} />
      {children}
    </PageContainer>
  );
}

export function ProjectFrameSkeleton() {
  return (
    <PageContainer className="flex flex-col gap-6">
      <div className="flex flex-col gap-4" role="status" aria-label="Loading project">
        <Skeleton className="h-3.5 w-20" />
        <Skeleton className="h-8 w-80 max-w-full" />
        <Skeleton className="h-6 w-56" />
      </div>
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-64 w-full rounded-lg" />
    </PageContainer>
  );
}

export function ProjectSectionSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="flex flex-col gap-3">
      <Skeleton className="h-24 w-full rounded-lg" />
      <Skeleton className="h-24 w-full rounded-lg" />
    </div>
  );
}
