import { loadProjectPage } from "../server/page-data";
import { CalendarDate } from "./calendar-date";
import { LocalDate } from "@/shared/ui/local-date";
import { Surface } from "@/shared/ui/surface";
import { SectionHeading } from "@/shared/ui/page";
import { CategoryLabel, PriorityLabel, StatusBadge } from "./badges";
import { DueDate } from "./due-date";

export async function ProjectOverview({ params }: { params: Promise<{ workspace: string; projectId: string }> }) {
  const { project } = await loadProjectPage(params);
  const archived = project.archivedAt !== null;

  const details: { label: string; value: React.ReactNode }[] = [
    { label: "Status", value: <StatusBadge status={project.status} /> },
    { label: "Category", value: project.category ? <CategoryLabel category={project.category} /> : <span className="text-fg-faint">None</span> },
    { label: "Priority", value: <PriorityLabel priority={project.priority} showNormal /> },
    { label: "Client", value: project.client || <span className="text-fg-faint">None</span> },
    { label: "Start date", value: project.startDate ? <CalendarDate value={project.startDate} /> : <span className="text-fg-faint">Not set</span> },
    {
      label: "Due date",
      value: <DueDate dueDate={project.dueDate} statusKind={project.status.kind} archived={archived} empty="Not set" />,
    },
    {
      label: "Created",
      value: (
        <span>
          <LocalDate value={project.createdAt.toISOString()} options={{ day: "numeric", month: "short", year: "numeric" }} />
          {project.createdByName ? <span className="text-fg-muted"> by {project.createdByName}</span> : null}
        </span>
      ),
    },
    {
      label: "Last updated",
      value: <LocalDate value={project.updatedAt.toISOString()} options={{ day: "numeric", month: "short", year: "numeric" }} />,
    },
  ];

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-8">
        <section aria-label="Description">
          <SectionHeading title="Description" />
          <Surface className="p-5">
            {project.description ? (
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-fg">{project.description}</p>
            ) : (
              <p className="text-sm text-fg-faint">No description yet. Use Edit to add the brief.</p>
            )}
          </Surface>
        </section>

        <section aria-label="Custom details">
          <SectionHeading title="Custom details" />
          <Surface>
            {project.customFields.length > 0 ? (
              <dl className="divide-y divide-line-subtle">
                {project.customFields.map((field) => (
                  <div key={field.key} className="grid gap-1 px-5 py-3 text-[0.8125rem] sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:gap-4">
                    <dt className="text-fg-muted">{field.key}</dt>
                    <dd className="break-words font-medium text-fg">{field.value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="px-5 py-4 text-sm text-fg-faint">Nothing recorded. Add frame rate, resolution, deliverables and similar through Edit.</p>
            )}
          </Surface>
        </section>
      </div>

      <section aria-label="Details">
        <SectionHeading title="Details" />
        <Surface>
          <dl className="divide-y divide-line-subtle">
            {details.map((detail) => (
              <div key={detail.label} className="flex min-h-11 items-center justify-between gap-4 px-5 py-2.5 text-[0.8125rem]">
                <dt className="shrink-0 text-fg-muted">{detail.label}</dt>
                <dd className="min-w-0 truncate text-right font-medium text-fg">{detail.value}</dd>
              </div>
            ))}
          </dl>
        </Surface>
      </section>
    </div>
  );
}
