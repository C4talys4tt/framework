import { notFound } from "next/navigation";
import { Suspense } from "react";
import { RecentProjects } from "@/modules/projects/components/recent-projects";
import { MODULES, isAvailable } from "@/modules/shell/navigation";
import { getWorkspaceContext } from "@/modules/workspaces/server/queries";
import { Kbd } from "@/shared/ui/kbd";
import { LocalDate } from "@/shared/ui/local-date";
import { PageContainer, PageHeader, SectionHeading } from "@/shared/ui/page";
import { Skeleton } from "@/shared/ui/skeleton";
import { Surface } from "@/shared/ui/surface";
import { ModuleGrid } from "./module-grid";
import { OpenPaletteButton } from "./open-palette-button";

const SHORTCUTS: { label: string; keys: string[] }[] = [
  { label: "Open the command palette", keys: ["⌘", "K"] },
  { label: "Collapse or expand the sidebar", keys: ["⌘", "B"] },
  { label: "Go to Overview", keys: ["G", "O"] },
  { label: "Go to Projects", keys: ["G", "P"] },
  { label: "Go to Settings", keys: ["G", "S"] },
];

export async function Overview({ params }: { params: Promise<{ workspace: string }> }) {
  const { workspace: slug } = await params;
  const context = await getWorkspaceContext(slug);
  if (!context) notFound();
  const { user, workspace } = context;

  const firstName = user.name.trim().split(/\s+/)[0] ?? user.name;
  const availableCount = MODULES.filter(isAvailable).length;

  const facts = [
    { label: "Workspace", value: workspace.name },
    { label: "Your role", value: workspace.role === "owner" ? "Owner" : "Member" },
    { label: "Members", value: String(workspace.memberCount) },
    {
      label: "Created",
      value: <LocalDate value={workspace.createdAt.toISOString()} options={{ day: "numeric", month: "short", year: "numeric" }} />,
    },
  ];

  return (
    <PageContainer className="flex animate-fade-in flex-col gap-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          eyebrow={<LocalDate options={{ weekday: "long", day: "numeric", month: "long" }} />}
          title={`Welcome, ${firstName}`}
          description="Your studio at a glance. Modules arrive here as they are built."
        />
        <OpenPaletteButton />
      </div>

      <section aria-label="Workspace details">
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line-subtle bg-line-subtle shadow-raised md:grid-cols-4">
          {facts.map((fact) => (
            <div key={fact.label} className="flex min-w-0 flex-col gap-1 bg-surface px-5 py-4">
              <dt className="text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-fg-faint">{fact.label}</dt>
              <dd className="min-h-5 truncate text-sm font-medium text-fg">{fact.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-label="Studio modules">
        <SectionHeading title="Studio modules" aside={`${availableCount} of ${MODULES.length} available`} />
        <ModuleGrid workspaceSlug={workspace.slug} />
      </section>

      <div className="grid gap-10 lg:grid-cols-[1.6fr_1fr] lg:gap-6">
        <section aria-label="Recent work">
          <SectionHeading title="Recent work" />
          <Suspense fallback={<Skeleton className="h-52 w-full rounded-lg" />}>
            <RecentProjects workspaceId={workspace.id} workspaceSlug={workspace.slug} />
          </Suspense>
        </section>

        <section aria-label="Keyboard shortcuts">
          <SectionHeading title="Keyboard" />
          <Surface>
            <ul className="divide-y divide-line-subtle">
              {SHORTCUTS.map((shortcut) => (
                <li key={shortcut.label} className="flex h-11 items-center justify-between gap-4 px-4 text-[0.8125rem] text-fg-muted">
                  {shortcut.label}
                  <span className="flex shrink-0 gap-1">
                    {shortcut.keys.map((key) => (
                      <Kbd key={key}>{key}</Kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
            <p className="border-t border-line-subtle px-4 py-3 text-xs text-fg-faint">On Windows and Linux, use Ctrl in place of ⌘.</p>
          </Surface>
        </section>
      </div>
    </PageContainer>
  );
}

export function OverviewSkeleton() {
  return (
    <PageContainer className="flex flex-col gap-10">
      <div className="flex flex-col gap-3" role="status" aria-label="Loading overview">
        <Skeleton className="h-3 w-36" />
        <Skeleton className="h-7 w-64 max-w-full" />
        <Skeleton className="h-3.5 w-96 max-w-full" />
      </div>
      <Skeleton className="h-[4.5rem] w-full rounded-lg" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton key={index} className="h-32 rounded-lg" />
        ))}
      </div>
    </PageContainer>
  );
}
