import Link from "next/link";
import { FolderOpen, SearchX } from "lucide-react";
import { z } from "zod";
import { workspacePath } from "@/modules/shell/navigation";
import { EmptyState } from "@/shared/ui/empty-state";
import { LocalDate } from "@/shared/ui/local-date";
import { PageContainer, PageHeader } from "@/shared/ui/page";
import { Skeleton } from "@/shared/ui/skeleton";
import { Surface } from "@/shared/ui/surface";
import { COLLECTION_SORTS, type CollectionSummary } from "../domain/reference";
import { loadLibraryWorkspace } from "../server/page-data";
import { getCollections, getLibraryCounts } from "../server/queries";
import { CollectionsToolbar, NewCollectionButton } from "./collections-toolbar";
import { LibraryTabs } from "./library-tabs";
import { ReferenceImage } from "./reference-image";

type SearchParams = Record<string, string | string[] | undefined>;

export async function CollectionsView({ params, searchParams }: { params: Promise<{ workspace: string }>; searchParams: Promise<SearchParams> }) {
  const { workspace } = await loadLibraryWorkspace(params);
  const raw = await searchParams;
  const q = typeof raw.q === "string" ? raw.q.replace(/\s+/g, " ").trim().slice(0, 80) : "";
  const sortParse = z.enum(COLLECTION_SORTS).safeParse(raw.sort);
  const sort = sortParse.success ? sortParse.data : "updated";
  const [collections, everything, counts] = await Promise.all([
    getCollections(workspace.id, { q, sort }),
    q ? getCollections(workspace.id) : null,
    getLibraryCounts(workspace.id),
  ]);
  const total = everything ? everything.length : collections.length;
  const base = workspacePath(workspace.slug, "library");

  return (
    <PageContainer width="wide" className="flex animate-fade-in flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader eyebrow="Visual Library" title="Collections" description="Sets of references, gathered by look, client, shot or idea. One reference can sit in many collections." />
        <NewCollectionButton workspaceId={workspace.id} base={base} autoOpen={raw.new === "1"} />
      </div>
      <LibraryTabs base={base} counts={{ references: counts.total, collections: total }} />

      {total === 0 ? (
        <Surface>
          <EmptyState
            icon={<FolderOpen aria-hidden className="size-4" />}
            title="No collections yet"
            description="Create a collection, then add references to it from the library, a reference's page, or by selecting several at once."
            action={<NewCollectionButton workspaceId={workspace.id} base={base} label="Create your first collection" />}
          />
        </Surface>
      ) : (
        <>
          <CollectionsToolbar q={q} sort={sort} />
          <p role="status" className="-mb-2 text-xs text-fg-faint">
            {collections.length} {collections.length === 1 ? "collection" : "collections"}
            {q ? " match" : ""}
          </p>
          {collections.length === 0 ? (
            <Surface>
              <EmptyState icon={<SearchX aria-hidden className="size-4" />} title="No collections match" description="Try another name or word from a description." />
            </Surface>
          ) : (
            <ul aria-label="Collections" className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-5">
              {collections.map((collection) => (
                <li key={collection.id}>
                  <CollectionCard collection={collection} href={`${base}/collections/${collection.id}`} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </PageContainer>
  );
}

function CollectionCard({ collection, href }: { collection: CollectionSummary; href: string }) {
  const strip = collection.previews.slice(0, 3);
  return (
    <Link href={href} className="group flex flex-col gap-3 rounded-lg outline-offset-4">
      <div className="grid aspect-[4/3] grid-cols-[2fr_1fr] grid-rows-3 gap-1 overflow-hidden rounded-lg border border-line-subtle bg-surface p-1 shadow-raised transition-[border-color,transform] duration-300 ease-out-quint group-hover:-translate-y-0.5 group-hover:border-line-strong">
        {collection.cover ? (
          <ReferenceImage referenceId={collection.cover.id} alt="" dominantColor={collection.cover.dominantColor} className="row-span-3 rounded-md" />
        ) : (
          <span className="row-span-3 grid place-items-center rounded-md bg-raised text-fg-faint">
            <FolderOpen aria-hidden className="size-5" />
          </span>
        )}
        {Array.from({ length: 3 }, (_, index) => {
          const preview = strip[index];
          return preview ? (
            <ReferenceImage key={preview.id} referenceId={preview.id} alt="" dominantColor={preview.dominantColor} className="rounded-[5px]" />
          ) : (
            <span key={`empty-${index}`} className="rounded-[5px] bg-raised" />
          );
        })}
      </div>
      <div className="flex flex-col gap-0.5 px-0.5">
        <p className="truncate text-sm font-medium text-fg group-hover:text-accent">{collection.name}</p>
        <p className="flex items-center gap-1.5 text-xs text-fg-faint">
          <span>
            {collection.count} {collection.count === 1 ? "reference" : "references"}
          </span>
          <span aria-hidden>·</span>
          <LocalDate value={collection.updatedAt} options={{ day: "numeric", month: "short" }} />
        </p>
      </div>
    </Link>
  );
}

export function CollectionsSkeleton() {
  return (
    <PageContainer width="wide" className="flex flex-col gap-6">
      <div className="flex flex-col gap-3" role="status" aria-label="Loading collections">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-7 w-44" />
      </div>
      <Skeleton className="h-9 w-full" />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-5">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="aspect-[4/3] w-full rounded-lg" />
        ))}
      </div>
    </PageContainer>
  );
}
