import { z } from "zod";
import { normalizeTagName, normalizeTags } from "@/modules/projects/domain/project";
import type { ImageType, Variant } from "./files";

export const LIMITS = {
  title: 200,
  description: 5000,
  sourceUrl: 2048,
  tagName: 30,
  tagsPerReference: 24,
  tagsPerFilter: 8,
  search: 100,
  collectionName: 80,
  collectionDescription: 2000,
} as const;

export const PAGE_SIZE = 48;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ReferenceListItem = {
  id: string;
  title: string;
  width: number;
  height: number;
  dominantColor: string;
  mimeType: ImageType;
  byteSize: number;
  /** ISO timestamp. */
  createdAt: string;
  favorite: boolean;
  tags: string[];
};

export type ReferenceMetadata = {
  format?: string;
  space?: string;
  hasAlpha?: boolean;
  animated?: boolean;
  frames?: number;
  density?: number;
  camera?: string;
  lens?: string;
  capturedAt?: string;
  exposure?: string;
  aperture?: string;
  iso?: number;
  focalLength?: string;
};

export type LinkedProject = { id: string; name: string; archived: boolean };
export type LinkedCollection = { id: string; name: string };
export type LinkedMoodboard = { id: string; name: string; uses: number };

export type ReferenceDetail = ReferenceListItem & {
  workspaceId: string;
  description: string;
  sourceUrl: string | null;
  originalFilename: string;
  metadata: ReferenceMetadata;
  createdByName: string | null;
  canDelete: boolean;
  updatedAt: string;
  collections: LinkedCollection[];
  projects: LinkedProject[];
  moodboards: LinkedMoodboard[];
};

export type TagCount = { id: string; name: string; count: number };

/** What deleting a reference will also remove, for the confirmation. */
export type ReferenceUsage = { collections: number; projects: number; moodboards: number; placements: number };

export function fileUrl(referenceId: string, variant: Variant): string {
  return `/api/library/files/${referenceId}/${variant}`;
}

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

export const referenceTitleSchema = z
  .string()
  .trim()
  .min(1, "Give the reference a title.")
  .max(LIMITS.title, `Keep the title under ${LIMITS.title} characters.`);

const sourceUrlSchema = z
  .string()
  .trim()
  .max(LIMITS.sourceUrl, "That link is too long.")
  .transform((value) => (value === "" ? null : value))
  .pipe(
    z
      .url({ protocol: /^https?$/, message: "Enter a full web address starting with https://" })
      .refine((value) => !/\s/.test(value), "Enter a full web address starting with https://")
      .nullable(),
  );

export const referenceInputSchema = z.object({
  title: referenceTitleSchema,
  description: z.string().max(LIMITS.description, `Keep the description under ${LIMITS.description} characters.`),
  sourceUrl: sourceUrlSchema,
});
export type ReferenceInput = z.infer<typeof referenceInputSchema>;
export type ReferenceFormValues = z.input<typeof referenceInputSchema>;

export const tagNameSchema = z
  .string()
  .transform((value) => normalizeTagName(value))
  .pipe(
    z
      .string()
      .min(1, "Enter a tag.")
      .max(LIMITS.tagName, `Keep each tag under ${LIMITS.tagName} characters.`)
      .regex(/^[^,\n\r]+$/, "Tags cannot contain commas."),
  );

export const tagListSchema = z
  .array(z.string())
  .transform(normalizeTags)
  .pipe(
    z
      .array(z.string().max(LIMITS.tagName, `Keep each tag under ${LIMITS.tagName} characters.`).regex(/^[^,\n\r]+$/))
      .max(LIMITS.tagsPerReference, `Use at most ${LIMITS.tagsPerReference} tags.`),
  );

export const collectionInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give the collection a name.")
    .max(LIMITS.collectionName, `Keep the name under ${LIMITS.collectionName} characters.`),
  description: z
    .string()
    .trim()
    .max(LIMITS.collectionDescription, `Keep the description under ${LIMITS.collectionDescription} characters.`),
});
export type CollectionInput = z.infer<typeof collectionInputSchema>;

// ---------------------------------------------------------------------------
// Browsing filters (they live in the URL)
// ---------------------------------------------------------------------------

export const VIEWS = ["all", "favorites", "recent", "unsorted"] as const;
export type View = (typeof VIEWS)[number];
export const VIEW_LABEL: Record<View, string> = {
  all: "All",
  favorites: "Favorites",
  recent: "Recent",
  unsorted: "Not in a collection",
};
/** "Recent" means added in this many days. */
export const RECENT_DAYS = 14;

export const SORTS = ["newest", "oldest", "title", "title_desc"] as const;
export type Sort = (typeof SORTS)[number];
export const SORT_LABEL: Record<Sort, string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  title: "Title A–Z",
  title_desc: "Title Z–A",
};

export const LAYOUTS = ["masonry", "grid", "list"] as const;
export type Layout = (typeof LAYOUTS)[number];

export type LibraryFilters = {
  q: string;
  /** Every tag must match (narrowing, like adding search terms). */
  tags: string[];
  collection: string | null;
  view: View;
  sort: Sort;
};

export const DEFAULT_FILTERS: LibraryFilters = { q: "", tags: [], collection: null, view: "all", sort: "newest" };

type RawParams = Record<string, string | string[] | undefined>;

function first(raw: RawParams, key: string): string | undefined {
  const value = raw[key];
  return Array.isArray(value) ? value[0] : value;
}

function all(raw: RawParams, key: string): string[] {
  const value = raw[key];
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

export function parseLibraryFilters(raw: RawParams): LibraryFilters {
  const q = normalizeTagName(first(raw, "q") ?? "").slice(0, LIMITS.search);
  const tags = normalizeTags(all(raw, "tag").map((tag) => tag.slice(0, LIMITS.tagName))).slice(0, LIMITS.tagsPerFilter);
  const collection = z.uuid().safeParse(first(raw, "collection"));
  const view = z.enum(VIEWS).safeParse(first(raw, "view"));
  const sort = z.enum(SORTS).safeParse(first(raw, "sort"));
  return {
    q,
    tags,
    collection: collection.success ? collection.data : null,
    view: view.success ? view.data : DEFAULT_FILTERS.view,
    sort: sort.success ? sort.data : DEFAULT_FILTERS.sort,
  };
}

/** Query string for a filter set, omitting defaults. `omit` drops keys the route already implies. */
export function filtersToQuery(filters: LibraryFilters, omit: { collection?: boolean } = {}): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  for (const tag of filters.tags) params.append("tag", tag);
  if (filters.collection && !omit.collection) params.set("collection", filters.collection);
  if (filters.view !== DEFAULT_FILTERS.view) params.set("view", filters.view);
  if (filters.sort !== DEFAULT_FILTERS.sort) params.set("sort", filters.sort);
  const text = params.toString();
  return text ? `?${text}` : "";
}

export function hasActiveFilters(filters: LibraryFilters, ignoreCollection = false): boolean {
  return Boolean(filters.q || filters.tags.length || (filters.collection && !ignoreCollection) || filters.view !== "all");
}

/** A stable identity for a filter set: when it changes, a loaded list starts again. */
export function filtersKey(filters: LibraryFilters): string {
  return JSON.stringify([filters.q, [...filters.tags].map((tag) => tag.toLowerCase()).sort(), filters.collection, filters.view, filters.sort]);
}

// ---------------------------------------------------------------------------
// Keyset cursors: stable paging while new references keep arriving
// ---------------------------------------------------------------------------

export type Cursor = { value: string; id: string };

// Works in the browser and on the server (no Buffer).
function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): string {
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

export function encodeCursor(cursor: Cursor): string {
  return toBase64Url(JSON.stringify([cursor.value, cursor.id]));
}

export function decodeCursor(text: string | null | undefined): Cursor | null {
  if (!text || text.length > 600) return null;
  try {
    const parsed: unknown = JSON.parse(fromBase64Url(text));
    const shape = z.tuple([z.string().max(400), z.uuid()]).safeParse(parsed);
    return shape.success ? { value: shape.data[0], id: shape.data[1] } : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

export type CollectionSummary = {
  id: string;
  name: string;
  description: string;
  count: number;
  /** The explicit cover, else the most recently added reference. */
  cover: { id: string; dominantColor: string } | null;
  coverIsExplicit: boolean;
  /** Up to three more references for the card's strip. */
  previews: { id: string; dominantColor: string }[];
  updatedAt: string;
  canDelete: boolean;
};

export const COLLECTION_SORTS = ["updated", "name", "created", "size"] as const;
export type CollectionSort = (typeof COLLECTION_SORTS)[number];
export const COLLECTION_SORT_LABEL: Record<CollectionSort, string> = {
  updated: "Recently changed",
  name: "Name A–Z",
  created: "Newest first",
  size: "Most references",
};
