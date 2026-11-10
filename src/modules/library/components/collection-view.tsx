import Link from "next/link";
import { ArrowLeft, FolderOpen, SearchX } from "lucide-react";
import { workspacePath } from "@/modules/shell/navigation";
import { EmptyState } from "@/shared/ui/empty-state";
import { PageContainer } from "@/shared/ui/page";
import { Skeleton } from "@/shared/ui/skeleton";
import { Surface } from "@/shared/ui/surface";
import { filtersKey, parseLibraryFilters } from "../domain/reference";
import { loadCollectionPage } from "../server/page-data";
import { getActiveProjects, getCollectionChoices, getLibraryPage, getLibraryTags } from "../server/queries";
import { CollectionBrowser, CollectionHeaderActions } from "./collection-parts";
import { ReferenceGridSkeleton } from "./library-view";
import { UploadDropzone } from "./upload/upload-controls";

type SearchParams = Record<string, string | string[] | undefined>;

export async function CollectionView({
  params,
  searchParams,
}: {
  params: Promise<{ workspace: string; collectionId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { workspace, collection } = await loadCollectionPage(params);
  const filters = { ...parseLibraryFilters(await searchParams), collection: collection.id };
  const [page, tags, collections, projects] = await Promise.all([
    getLibraryPage(workspace.id, filters),
    getLibraryTags(workspace.id),
    getCollectionChoices(workspace.id),
    getActiveProjects(workspace.id),
  ]);
  const base = workspacePath(workspace.slug, "library");
  const target = { workspaceId: workspace.id, collectionId: collection.id };

  return (
    <UploadDropzone target={target} label={`Drop images to add them to “${collection.name}”`}>
      <PageContainer width="wide" className="flex animate-fade-in flex-col gap-6">
        <Link href={`${base}/collections`} className="inline-flex w-fit items-center gap-1.5 text-[0.8125rem] text-fg-muted transition-colors hover:text-fg">
          <ArrowLeft aria-hidden className="size-3.5" />
          Collections
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <header className="flex min-w-0 max-w-2xl flex-col gap-1.5">
            <p className="font-mono text-[0.6875rem] uppercase tracking-[0.1em] text-fg-faint">Collection · {collection.count} {collection.count === 1 ? "reference" : "references"}</p>
            <h1 className="break-words text-2xl font-semibold tracking-[-0.02em] text-fg">{collection.name}</h1>
            {collection.description ? <p className="whitespace-pre-wrap text-sm leading-relaxed text-fg-muted">{collection.description}</p> : null}
          </header>
          <CollectionHeaderActions collection={collection} workspaceId={workspace.id} collectionsHref={`${base}/collections`} />
        </div>

        <CollectionBrowser
          scope={{ workspaceId: workspace.id, workspaceSlug: workspace.slug, collectionId: collection.id }}
          coverId={collection.coverIsExplicit ? (collection.cover?.id ?? null) : null}
          filters={filters}
          filtersKey={filtersKey(filters)}
          initial={page}
          tags={tags}
          collections={collections}
          projects={projects}
          empty={
            <Surface>
              <EmptyState
                icon={<FolderOpen aria-hidden className="size-4" />}
                title="This collection is empty"
                description="Add references from the library, or drop image files here to upload them straight into this collection."
                action={<CollectionHeaderActions collection={collection} workspaceId={workspace.id} collectionsHref={`${base}/collections`} compact />}
              />
            </Surface>
          }
          noMatches={
            <Surface>
              <EmptyState icon={<SearchX aria-hidden className="size-4" />} title="Nothing in this collection matches" description="Try a different search or fewer tags." />
            </Surface>
          }
        />
      </PageContainer>
    </UploadDropzone>
  );
}

export function CollectionSkeleton() {
  return (
    <PageContainer width="wide" className="flex flex-col gap-6">
      <div role="status" aria-label="Loading collection" className="flex flex-col gap-3">
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-7 w-64" />
      </div>
      <Skeleton className="h-9 w-full" />
      <ReferenceGridSkeleton />
    </PageContainer>
  );
}
