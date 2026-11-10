import { ImagePlus, SearchX } from "lucide-react";
import Link from "next/link";
import { workspacePath } from "@/modules/shell/navigation";
import { Button } from "@/shared/ui/button";
import { EmptyState } from "@/shared/ui/empty-state";
import { PageContainer, PageHeader } from "@/shared/ui/page";
import { Skeleton } from "@/shared/ui/skeleton";
import { Surface } from "@/shared/ui/surface";
import { filtersKey, parseLibraryFilters } from "../domain/reference";
import { loadLibraryWorkspace } from "../server/page-data";
import { getActiveProjects, getCollectionChoices, getLibraryCounts, getLibraryPage, getLibraryTags } from "../server/queries";
import { LibraryTabs } from "./library-tabs";
import { ReferenceBrowser } from "./reference-browser";
import { UploadButton, UploadDropzone } from "./upload/upload-controls";

type SearchParams = Record<string, string | string[] | undefined>;

export async function LibraryView({ params, searchParams }: { params: Promise<{ workspace: string }>; searchParams: Promise<SearchParams> }) {
  const { workspace } = await loadLibraryWorkspace(params);
  const filters = parseLibraryFilters(await searchParams);
  const [page, tags, collections, projects, counts] = await Promise.all([
    getLibraryPage(workspace.id, filters),
    getLibraryTags(workspace.id),
    getCollectionChoices(workspace.id),
    getActiveProjects(workspace.id),
    getLibraryCounts(workspace.id),
  ]);
  const base = workspacePath(workspace.slug, "library");
  const target = { workspaceId: workspace.id };

  return (
    <UploadDropzone target={target}>
      <PageContainer width="wide" className="flex animate-fade-in flex-col gap-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <PageHeader
            eyebrow="Visual Library"
            title="References"
            description="Collect, tag and arrange visual inspiration across every project."
          />
          <div className="flex items-center gap-3">
            <p className="hidden text-right text-xs leading-tight text-fg-faint sm:block">
              <span className="font-mono text-fg-muted">{counts.total}</span> in library
              <br />
              <span className="font-mono text-fg-muted">{counts.favorites}</span> favorites
            </p>
            <UploadButton target={target} autoOpenParam />
          </div>
        </div>
        <LibraryTabs base={base} counts={{ references: counts.total, collections: collections.length }} />
        <ReferenceBrowser
          scope={{ workspaceId: workspace.id, workspaceSlug: workspace.slug }}
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
                title="Your library is empty"
                description="Upload stills, frame grabs, photography and artwork, or drop image files anywhere on this page. Then tag them, group them into collections and arrange them on moodboards."
                action={<UploadButton target={target}>Upload images</UploadButton>}
              />
            </Surface>
          }
          noMatches={
            <Surface>
              <EmptyState
                icon={<SearchX aria-hidden className="size-4" />}
                title="No references match"
                description="Try a different search or fewer tags, or clear the filters to see everything."
                action={
                  <Button asChild>
                    <Link href={base}>Clear filters</Link>
                  </Button>
                }
              />
            </Surface>
          }
        />
      </PageContainer>
    </UploadDropzone>
  );
}

export function LibrarySkeleton({ label = "Loading the library" }: { label?: string }) {
  return (
    <PageContainer width="wide" className="flex flex-col gap-6">
      <div className="flex flex-col gap-3" role="status" aria-label={label}>
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-3.5 w-96 max-w-full" />
      </div>
      <Skeleton className="h-9 w-full" />
      <ReferenceGridSkeleton />
    </PageContainer>
  );
}

const SKELETON_RATIOS = [1.25, 0.7, 1, 1.4, 0.8, 1.1, 0.66, 1.3, 0.9, 1.2, 0.75, 1];

export function ReferenceGridSkeleton() {
  return (
    <div aria-hidden className="columns-[14rem] gap-3">
      {SKELETON_RATIOS.map((ratio, index) => (
        <Skeleton key={index} className="mb-3 w-full break-inside-avoid rounded-md" style={{ aspectRatio: `1 / ${ratio}` }} />
      ))}
    </div>
  );
}
