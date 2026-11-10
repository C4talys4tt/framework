import { notFound, redirect } from "next/navigation";
import { FolderKanban, SearchX } from "lucide-react";
import Link from "next/link";
import { workspacePath } from "@/modules/shell/navigation";
import { getWorkspaceContext } from "@/modules/workspaces/server/queries";
import { Button } from "@/shared/ui/button";
import { EmptyState } from "@/shared/ui/empty-state";
import { PageContainer, PageHeader } from "@/shared/ui/page";
import { Skeleton } from "@/shared/ui/skeleton";
import { Surface } from "@/shared/ui/surface";
import { filtersToQuery, hasActiveFilters, pageCount, parseProjectFilters } from "../domain/project";
import { getProjectOptions, getProjectPage } from "../server/queries";
import { NewProjectButton } from "./new-project-button";
import { ProjectFilterBar } from "./project-filter-bar";
import { Pagination, ProjectList } from "./project-list";

type SearchParams = Record<string, string | string[] | undefined>;

export async function ProjectsView({ params, searchParams }: { params: Promise<{ workspace: string }>; searchParams: Promise<SearchParams> }) {
  const { workspace: slug } = await params;
  const context = await getWorkspaceContext(slug);
  if (!context) notFound();
  const { workspace } = context;

  const raw = await searchParams;
  const filters = parseProjectFilters(raw);
  const [options, page] = await Promise.all([getProjectOptions(workspace.id), getProjectPage(workspace.id, filters)]);

  const base = workspacePath(workspace.slug, "projects");
  if (page.items.length === 0 && filters.page > 1) {
    redirect(`${base}${filtersToQuery({ ...filters, page: Math.min(filters.page - 1, pageCount(page.total)) })}`);
  }

  const tagSuggestions = options.tags.map((tag) => tag.name);
  const creator = {
    workspaceId: workspace.id,
    workspaceSlug: workspace.slug,
    statuses: options.statuses,
    categories: options.categories,
    tagSuggestions,
  };
  const filtered = hasActiveFilters(filters);
  const everEmpty = page.total === 0 && !filtered;
  const autoOpen = raw.new === "1";

  return (
    <PageContainer className="flex animate-fade-in flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          eyebrow="Projects"
          title="Projects"
          description="Plan and track creative work from brief to delivery."
        />
        <NewProjectButton {...creator} autoOpen={autoOpen} cleanHref={`${base}${filtersToQuery(filters)}`} />
      </div>

      {everEmpty ? (
        <Surface>
          <EmptyState
            icon={<FolderKanban aria-hidden className="size-4" />}
            title="No projects yet"
            description="Create a project to track its status, deadline, notes and history in one place."
            action={<NewProjectButton {...creator}>Create your first project</NewProjectButton>}
          />
        </Surface>
      ) : (
        <>
          <ProjectFilterBar filters={filters} statuses={options.statuses} categories={options.categories} tags={options.tags} />
          <p role="status" className="-mb-2 text-xs text-fg-faint">
            {page.total} {page.total === 1 ? "project" : "projects"}
            {filtered ? " match" : ""}
          </p>
          {page.items.length === 0 ? (
            <Surface>
              <EmptyState
                icon={<SearchX aria-hidden className="size-4" />}
                title="No projects match"
                description="Try a different search, or clear the filters to see everything."
                action={
                  <Button asChild>
                    <Link href={base}>Clear filters</Link>
                  </Button>
                }
              />
            </Surface>
          ) : (
            <ProjectList workspaceSlug={workspace.slug} projects={page.items} />
          )}
          <Pagination workspaceSlug={workspace.slug} filters={filters} total={page.total} />
        </>
      )}
    </PageContainer>
  );
}

export function ProjectsSkeleton() {
  return (
    <PageContainer className="flex flex-col gap-6">
      <div className="flex flex-col gap-3" role="status" aria-label="Loading projects">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-3.5 w-80 max-w-full" />
      </div>
      <Skeleton className="h-9 w-full" />
      <div className="flex flex-col gap-px overflow-hidden rounded-lg">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-[3.75rem] w-full rounded-none" />
        ))}
      </div>
    </PageContainer>
  );
}
