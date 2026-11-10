import Link from "next/link";
import { ArrowLeft, ExternalLink, LayoutPanelLeft } from "lucide-react";
import { workspacePath } from "@/modules/shell/navigation";
import { LocalDate } from "@/shared/ui/local-date";
import { PageContainer, SectionHeading } from "@/shared/ui/page";
import { Skeleton } from "@/shared/ui/skeleton";
import { Surface } from "@/shared/ui/surface";
import { TYPE_LABEL, formatBytes } from "../domain/files";
import { fileUrl } from "../domain/reference";
import { loadReferencePage } from "../server/page-data";
import { getCollectionChoices, getLibraryTags, getProjectChoices } from "../server/queries";
import { ReferenceImage } from "./reference-image";
import { ReferenceCollections, ReferenceHeaderActions, ReferenceMetaForm, ReferenceProjects, ReferenceTagsEditor } from "./reference-detail-parts";

export async function ReferenceDetailView({ params }: { params: Promise<{ workspace: string; referenceId: string }> }) {
  const { workspace, reference } = await loadReferencePage(params);
  const [tags, collections, projects] = await Promise.all([
    getLibraryTags(workspace.id),
    getCollectionChoices(workspace.id),
    getProjectChoices(workspace.id),
  ]);
  const base = workspacePath(workspace.slug, "library");
  const meta = reference.metadata;
  const animated = meta.animated === true;

  const facts: { label: string; value: React.ReactNode }[] = [
    { label: "Added", value: <LocalDate value={reference.createdAt} options={{ day: "numeric", month: "short", year: "numeric" }} /> },
    ...(reference.createdByName ? [{ label: "Added by", value: reference.createdByName }] : []),
    { label: "Dimensions", value: `${reference.width} × ${reference.height}` },
    { label: "Format", value: `${TYPE_LABEL[reference.mimeType]}${animated ? ` · animated, ${meta.frames} frames` : ""}` },
    { label: "Size", value: formatBytes(reference.byteSize) },
    { label: "Original file", value: <span className="break-all">{reference.originalFilename}</span> },
    ...(meta.camera ? [{ label: "Camera", value: meta.camera }] : []),
    ...(meta.lens ? [{ label: "Lens", value: meta.lens }] : []),
    ...(meta.capturedAt ? [{ label: "Captured", value: <LocalDate value={meta.capturedAt} options={{ day: "numeric", month: "short", year: "numeric" }} /> }] : []),
    ...([meta.focalLength, meta.aperture, meta.exposure, meta.iso ? `ISO ${meta.iso}` : null].some(Boolean)
      ? [{ label: "Exposure", value: [meta.focalLength, meta.aperture, meta.exposure, meta.iso ? `ISO ${meta.iso}` : null].filter(Boolean).join(" · ") }]
      : []),
    ...(meta.space ? [{ label: "Colour", value: `${meta.space}${meta.hasAlpha ? " with transparency" : ""}` }] : []),
  ];

  return (
    <PageContainer width="wide" className="flex animate-fade-in flex-col gap-6">
      <Link href={base} className="inline-flex w-fit items-center gap-1.5 text-[0.8125rem] text-fg-muted transition-colors hover:text-fg">
        <ArrowLeft aria-hidden className="size-3.5" />
        Visual Library
      </Link>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
        <figure className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-8 lg:self-start">
          <a
            href={fileUrl(reference.id, animated || reference.mimeType === "image/gif" ? "original" : "preview")}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open ${reference.title} at full size`}
            className="group relative grid place-items-center overflow-hidden rounded-lg border border-line-subtle bg-[#08090b] p-4 shadow-raised md:p-8"
          >
            <ReferenceImage
              referenceId={reference.id}
              variant={animated || reference.mimeType === "image/gif" ? "original" : "preview"}
              alt={reference.title}
              dominantColor="transparent"
              fit="contain"
              eager
              className="w-full max-h-[72dvh]"
              style={{ aspectRatio: `${reference.width} / ${reference.height}`, maxWidth: `min(100%, calc(72dvh * ${reference.width / reference.height}))` }}
            />
            <span className="pointer-events-none absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[0.6875rem] text-white opacity-0 backdrop-blur transition-opacity group-hover:opacity-100">
              <ExternalLink aria-hidden className="size-3" />
              Full size
            </span>
          </a>
          <figcaption className="sr-only">{reference.title}</figcaption>
        </figure>

        <aside aria-label="Reference details" className="flex min-w-0 flex-col gap-7">
          <ReferenceHeaderActions reference={reference} libraryHref={base} />
          <ReferenceMetaForm reference={reference} />

          <section aria-label="Tags">
            <SectionHeading title="Tags" />
            <ReferenceTagsEditor referenceId={reference.id} tags={reference.tags} suggestions={tags.map((tag) => tag.name)} libraryHref={base} />
          </section>

          <section aria-label="Collections">
            <SectionHeading title="Collections" />
            <ReferenceCollections referenceId={reference.id} linked={reference.collections} choices={collections} workspaceId={workspace.id} libraryHref={base} />
          </section>

          <section aria-label="Projects">
            <SectionHeading title="Projects" />
            <ReferenceProjects referenceId={reference.id} linked={reference.projects} choices={projects} projectsHref={workspacePath(workspace.slug, "projects")} />
          </section>

          {reference.moodboards.length > 0 ? (
            <section aria-label="Moodboards">
              <SectionHeading title="On moodboards" />
              <ul className="flex flex-col gap-1">
                {reference.moodboards.map((board) => (
                  <li key={board.id}>
                    <Link
                      href={`${base}/moodboards/${board.id}`}
                      className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-[0.8125rem] text-fg transition-colors hover:bg-hover"
                    >
                      <LayoutPanelLeft aria-hidden className="size-3.5 text-fg-faint" />
                      <span className="min-w-0 flex-1 truncate">{board.name}</span>
                      {board.uses > 1 ? <span className="font-mono text-[0.6875rem] text-fg-faint">×{board.uses}</span> : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section aria-label="File">
            <SectionHeading title="File" />
            <Surface>
              <dl className="divide-y divide-line-subtle">
                {facts.map((fact) => (
                  <div key={fact.label} className="flex items-baseline justify-between gap-4 px-4 py-2.5 text-[0.8125rem]">
                    <dt className="shrink-0 text-fg-muted">{fact.label}</dt>
                    <dd className="min-w-0 text-right text-fg">{fact.value}</dd>
                  </div>
                ))}
              </dl>
            </Surface>
          </section>
        </aside>
      </div>
    </PageContainer>
  );
}

export function ReferenceDetailSkeleton() {
  return (
    <PageContainer width="wide" className="flex flex-col gap-6">
      <Skeleton className="h-3.5 w-28" />
      <div role="status" aria-label="Loading reference" className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Skeleton className="aspect-[4/3] w-full rounded-lg" />
        <div className="flex flex-col gap-4">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    </PageContainer>
  );
}
