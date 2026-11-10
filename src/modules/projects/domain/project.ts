import { z } from "zod";

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

export const HUES = ["gray", "blue", "green", "amber", "red", "violet", "pink", "teal"] as const;
export type Hue = (typeof HUES)[number];

/** Complete class names, so Tailwind can see them. Colours come from the theme's `--fw-hue-*` tokens. */
export const HUE_DOT: Record<Hue, string> = {
  gray: "bg-hue-gray",
  blue: "bg-hue-blue",
  green: "bg-hue-green",
  amber: "bg-hue-amber",
  red: "bg-hue-red",
  violet: "bg-hue-violet",
  pink: "bg-hue-pink",
  teal: "bg-hue-teal",
};

export const HUE_LABEL: Record<Hue, string> = {
  gray: "Gray",
  blue: "Blue",
  green: "Green",
  amber: "Amber",
  red: "Red",
  violet: "Violet",
  pink: "Pink",
  teal: "Teal",
};

export const STATUS_KINDS = ["planned", "active", "paused", "done"] as const;
export type StatusKind = (typeof STATUS_KINDS)[number];

export const STATUS_KIND_LABEL: Record<StatusKind, string> = {
  planned: "Not started",
  active: "In progress",
  paused: "Paused",
  done: "Finished",
};

export const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PRIORITY_LABEL: Record<Priority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

// ---------------------------------------------------------------------------
// Limits (mirrored by CHECK constraints in db/migrations/0002_projects.sql)
// ---------------------------------------------------------------------------

export const LIMITS = {
  projectName: 120,
  description: 5000,
  client: 80,
  tagName: 30,
  tagsPerProject: 12,
  fieldKey: 40,
  fieldValue: 200,
  fieldsPerProject: 20,
  taxonomyName: 40,
  noteTitle: 120,
  noteBody: 20000,
  search: 80,
} as const;

// ---------------------------------------------------------------------------
// Read models
// ---------------------------------------------------------------------------

export type ProjectStatus = { id: string; name: string; kind: StatusKind; color: Hue; position: number };
export type ProjectCategory = { id: string; name: string; color: Hue };
export type CustomField = { key: string; value: string };

export type ProjectListItem = {
  id: string;
  name: string;
  client: string;
  priority: Priority;
  dueDate: string | null;
  startDate: string | null;
  archivedAt: Date | null;
  updatedAt: Date;
  status: ProjectStatus;
  category: ProjectCategory | null;
  tags: string[];
  noteCount: number;
};

export type ProjectDetail = ProjectListItem & {
  description: string;
  customFields: CustomField[];
  createdAt: Date;
  createdByName: string | null;
  archivedByName: string | null;
};

export type TagCount = { name: string; count: number };

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

/** "  Look   dev " -> "Look dev" */
export function normalizeTagName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

/** Normalises, drops empties and de-duplicates case-insensitively, keeping the first spelling. */
export function normalizeTags(raw: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of raw) {
    const name = normalizeTagName(entry);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(name);
  }
  return result;
}

/** Splits pasted or typed text such as "grade, 4k, client work" into tags. */
export function splitTagInput(text: string): string[] {
  return text.split(/[,\n]/);
}

const trimmed = (max: number, tooLong: string) => z.string().trim().max(max, tooLong);

export const projectNameSchema = z
  .string()
  .trim()
  .min(1, "Give the project a name.")
  .max(LIMITS.projectName, `Keep the name under ${LIMITS.projectName} characters.`);

const isoDate = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value))
  .pipe(
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date.")
      .refine((value) => {
        const parsed = new Date(`${value}T00:00:00Z`);
        return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
      }, "Use a valid date.")
      .nullable(),
  );

const tagsSchema = z
  .array(z.string())
  // Normalising first drops blank entries and duplicates, so only real tags are validated.
  .transform(normalizeTags)
  .pipe(
    z
      .array(
        z
          .string()
          .max(LIMITS.tagName, `Keep each tag under ${LIMITS.tagName} characters.`)
          .regex(/^[^,\n\r]+$/, "Tags cannot contain commas."),
      )
      .max(LIMITS.tagsPerProject, `Use at most ${LIMITS.tagsPerProject} tags.`),
  );

const customFieldsSchema = z
  .array(z.object({ key: z.string().trim(), value: z.string().trim() }))
  // Blank rows are the form's empty "add a field" line, not an error.
  .transform((rows) => rows.filter((row) => row.key !== "" || row.value !== ""))
  .pipe(
    z
      .array(
        z.object({
          key: z.string().min(1, "Every field needs a name.").max(LIMITS.fieldKey, `Keep field names under ${LIMITS.fieldKey} characters.`),
          value: z.string().min(1, "Every field needs a value.").max(LIMITS.fieldValue, `Keep values under ${LIMITS.fieldValue} characters.`),
        }),
      )
      .max(LIMITS.fieldsPerProject, `Use at most ${LIMITS.fieldsPerProject} custom fields.`)
      .superRefine((rows, context) => {
        const seen = new Set<string>();
        for (const row of rows) {
          const key = row.key.toLowerCase();
          if (seen.has(key)) {
            context.addIssue({ code: "custom", message: `“${row.key}” is used twice.` });
            return;
          }
          seen.add(key);
        }
      }),
  );

export const projectInputSchema = z
  .object({
    name: projectNameSchema,
    description: trimmed(LIMITS.description, `Keep the description under ${LIMITS.description} characters.`),
    statusId: z.uuid("Choose a status."),
    categoryId: z.uuid().nullable(),
    client: trimmed(LIMITS.client, `Keep the client under ${LIMITS.client} characters.`),
    priority: z.enum(PRIORITIES, "Choose a priority."),
    startDate: isoDate,
    dueDate: isoDate,
    customFields: customFieldsSchema,
    tags: tagsSchema,
  })
  .superRefine((value, context) => {
    if (value.startDate && value.dueDate && value.startDate > value.dueDate) {
      context.addIssue({ code: "custom", path: ["dueDate"], message: "The due date can’t be before the start date." });
    }
  });

export type ProjectInput = z.infer<typeof projectInputSchema>;
/** What the form holds before validation. */
export type ProjectFormValues = z.input<typeof projectInputSchema>;

export const taxonomyNameSchema = z
  .string()
  .trim()
  .min(1, "Give it a name.")
  .max(LIMITS.taxonomyName, `Keep the name under ${LIMITS.taxonomyName} characters.`);

export const statusInputSchema = z.object({
  name: taxonomyNameSchema,
  kind: z.enum(STATUS_KINDS),
  color: z.enum(HUES),
});
export const categoryInputSchema = z.object({ name: taxonomyNameSchema, color: z.enum(HUES) });

export const noteInputSchema = z.object({
  title: trimmed(LIMITS.noteTitle, `Keep the title under ${LIMITS.noteTitle} characters.`),
  body: z
    .string()
    .trim()
    .min(1, "Write something first.")
    .max(LIMITS.noteBody, `Keep the note under ${LIMITS.noteBody.toLocaleString("en-US")} characters.`),
});

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

export type DueState = "overdue" | "soon" | "later";

const DAY_MS = 86_400_000;

function dayNumber(isoDate: string): number {
  return Math.floor(new Date(`${isoDate}T00:00:00Z`).getTime() / DAY_MS);
}

/**
 * How urgent a due date is relative to `today` (both `YYYY-MM-DD`, in the
 * viewer's calendar). Finished or archived projects are never flagged.
 */
export function dueState(
  dueDate: string | null,
  today: string,
  options: { statusKind: StatusKind; archived: boolean },
): DueState | null {
  if (!dueDate || options.archived || options.statusKind === "done") return null;
  const days = dayNumber(dueDate) - dayNumber(today);
  if (days < 0) return "overdue";
  if (days <= 3) return "soon";
  return "later";
}

/** `YYYY-MM-DD` for a Date in the runtime's local calendar. */
export function toLocalIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Formats a calendar date (no time zone involved) such as `2026-03-05` as "5 Mar 2026". */
export function formatCalendarDate(isoDate: string, options: { year?: boolean } = {}): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    ...(options.year === false ? {} : { year: "numeric" }),
    timeZone: "UTC",
  }).format(date);
}

// ---------------------------------------------------------------------------
// List filters (kept in the URL)
// ---------------------------------------------------------------------------

export const SORTS = ["updated", "created", "due", "name", "priority"] as const;
export type Sort = (typeof SORTS)[number];

export const SORT_LABEL: Record<Sort, string> = {
  updated: "Recently updated",
  created: "Newest",
  due: "Due date",
  name: "Name",
  priority: "Priority",
};

export const VIEWS = ["active", "archived", "all"] as const;
export type View = (typeof VIEWS)[number];

export const PAGE_SIZE = 25;

export type ProjectFilters = {
  q: string;
  status: string | null;
  /** A category id, or "none" for uncategorised projects. */
  category: string | null;
  tag: string | null;
  sort: Sort;
  view: View;
  page: number;
};

export const DEFAULT_FILTERS: ProjectFilters = {
  q: "",
  status: null,
  category: null,
  tag: null,
  sort: "updated",
  view: "active",
  page: 1,
};

type RawParams = Record<string, string | string[] | undefined>;

function first(raw: RawParams, key: string): string | undefined {
  const value = raw[key];
  return Array.isArray(value) ? value[0] : value;
}

/** Never throws: anything unrecognised falls back to the default. */
export function parseProjectFilters(raw: RawParams): ProjectFilters {
  const q = normalizeTagName(first(raw, "q") ?? "").slice(0, LIMITS.search);
  const status = z.uuid().safeParse(first(raw, "status"));
  const category = z.union([z.uuid(), z.literal("none")]).safeParse(first(raw, "category"));
  const tag = normalizeTagName(first(raw, "tag") ?? "").slice(0, LIMITS.tagName);
  const sort = z.enum(SORTS).safeParse(first(raw, "sort"));
  const view = z.enum(VIEWS).safeParse(first(raw, "view"));
  const page = z.coerce.number().int().min(1).max(10_000).safeParse(first(raw, "page"));
  return {
    q,
    status: status.success ? status.data : null,
    category: category.success ? category.data : null,
    tag: tag || null,
    sort: sort.success ? sort.data : DEFAULT_FILTERS.sort,
    view: view.success ? view.data : DEFAULT_FILTERS.view,
    page: page.success ? page.data : 1,
  };
}

/** Query string for a filter set, omitting defaults. Empty string when nothing differs. */
export function filtersToQuery(filters: ProjectFilters): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.status) params.set("status", filters.status);
  if (filters.category) params.set("category", filters.category);
  if (filters.tag) params.set("tag", filters.tag);
  if (filters.sort !== DEFAULT_FILTERS.sort) params.set("sort", filters.sort);
  if (filters.view !== DEFAULT_FILTERS.view) params.set("view", filters.view);
  if (filters.page > 1) params.set("page", String(filters.page));
  const text = params.toString();
  return text ? `?${text}` : "";
}

export function hasActiveFilters(filters: ProjectFilters): boolean {
  return Boolean(filters.q || filters.status || filters.category || filters.tag || filters.view !== "active");
}

export function pageCount(total: number): number {
  return Math.max(1, Math.ceil(total / PAGE_SIZE));
}
