import { formatCalendarDate, PRIORITY_LABEL, type Priority } from "./project";

export const ACTIVITY_KINDS = [
  "project_created",
  "renamed",
  "status_changed",
  "category_changed",
  "priority_changed",
  "client_changed",
  "start_date_changed",
  "due_date_changed",
  "description_changed",
  "fields_changed",
  "archived",
  "restored",
  "tag_added",
  "tag_removed",
  "note_added",
  "note_edited",
  "note_deleted",
  "note_pinned",
  "note_unpinned",
] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export type ActivityEntry = {
  id: number;
  kind: ActivityKind;
  data: Record<string, unknown>;
  /** Null when the person has since left the workspace. */
  actorName: string | null;
  /** ISO timestamp. */
  createdAt: string;
};

function text(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function names(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

const quote = (value: string) => `“${value}”`;

function change(noun: string, data: Record<string, unknown>, format: (value: string) => string = quote): string {
  const from = text(data.from);
  const to = text(data.to);
  if (from && to) return `changed the ${noun} from ${format(from)} to ${format(to)}`;
  if (to) return `set the ${noun} to ${format(to)}`;
  if (from) return `cleared the ${noun} (was ${format(from)})`;
  return `updated the ${noun}`;
}

function list(items: string[]): string {
  return items.map(quote).join(", ");
}

/** A sentence fragment that follows the actor's name: "changed the status from … to …". */
export function describeActivity(entry: Pick<ActivityEntry, "kind" | "data">): string {
  const { kind, data } = entry;
  switch (kind) {
    case "project_created":
      return "created the project";
    case "renamed":
      return change("name", data);
    case "status_changed":
      return change("status", data);
    case "category_changed":
      return change("category", data);
    case "priority_changed":
      return change("priority", data, (value) => (PRIORITY_LABEL[value as Priority] ?? value).toLowerCase());
    case "client_changed":
      return change("client", data);
    case "start_date_changed":
      return change("start date", data, (value) => formatCalendarDate(value));
    case "due_date_changed":
      return change("due date", data, (value) => formatCalendarDate(value));
    case "description_changed":
      return "edited the description";
    case "fields_changed": {
      const parts = [
        names(data.added).length ? `added ${list(names(data.added))}` : null,
        names(data.changed).length ? `changed ${list(names(data.changed))}` : null,
        names(data.removed).length ? `removed ${list(names(data.removed))}` : null,
      ].filter(Boolean);
      return parts.length ? `${parts.join(", ")} in the details` : "edited the details";
    }
    case "archived":
      return "archived the project";
    case "restored":
      return "restored the project";
    case "tag_added":
      return `added the tag ${quote(text(data.tag) ?? "")}`;
    case "tag_removed":
      return `removed the tag ${quote(text(data.tag) ?? "")}`;
    case "note_added":
      return `added a note${noteLabel(data)}`;
    case "note_edited":
      return `edited a note${noteLabel(data)}`;
    case "note_deleted":
      return `deleted a note${noteLabel(data)}`;
    case "note_pinned":
      return `pinned a note${noteLabel(data)}`;
    case "note_unpinned":
      return `unpinned a note${noteLabel(data)}`;
  }
}

function noteLabel(data: Record<string, unknown>): string {
  const title = text(data.title);
  return title ? ` ${quote(title)}` : "";
}
