import type { UserScopedDb } from "@/infrastructure/db/user-scope";
import { normalizeTags } from "@/modules/projects/domain/project";
import { LibraryError, PG, pgCode } from "../domain/errors";
import type { ImageType } from "../domain/files";
import {
  PAGE_SIZE,
  RECENT_DAYS,
  encodeCursor,
  type Cursor,
  type LibraryFilters,
  type ReferenceDetail,
  type ReferenceInput,
  type ReferenceListItem,
  type ReferenceMetadata,
  type ReferenceUsage,
  type Sort,
  type TagCount,
} from "../domain/reference";

// All queries run under RLS as the acting user (see runAsUser), and name the
// workspace explicitly, because a user can belong to several.

type ListRow = {
  id: string;
  title: string;
  width: number;
  height: number;
  dominant_color: string;
  mime_type: ImageType;
  byte_size: string;
  created_at: Date;
  created_cursor: string;
  title_cursor: string;
  favorite: boolean;
  tags: string[];
  total?: number;
};

const SELECT_LIST = `
  r.id, r.title, r.width, r.height, r.dominant_color, r.mime_type, r.byte_size, r.created_at,
  r.created_at::text as created_cursor, lower(r.title) as title_cursor,
  exists (select 1 from public.library_favorites f where f.reference_id = r.id and f.user_id = app.current_user_id()) as favorite,
  coalesce((
    select array_agg(t.name order by lower(t.name))
    from public.library_reference_tags rt join public.library_tags t on t.id = rt.tag_id
    where rt.reference_id = r.id
  ), '{}') as tags
`;

/** Fixed fragments only: user input never reaches ORDER BY. */
const ORDER: Record<Sort, { by: string; key: string; op: "<" | ">"; cursorType: "timestamptz" | "text" }> = {
  newest: { by: "r.created_at desc, r.id desc", key: "(r.created_at, r.id)", op: "<", cursorType: "timestamptz" },
  oldest: { by: "r.created_at asc, r.id asc", key: "(r.created_at, r.id)", op: ">", cursorType: "timestamptz" },
  title: { by: "lower(r.title) asc, r.id asc", key: "(lower(r.title), r.id)", op: ">", cursorType: "text" },
  title_desc: { by: "lower(r.title) desc, r.id desc", key: "(lower(r.title), r.id)", op: "<", cursorType: "text" },
};

function toListItem(row: ListRow): ReferenceListItem {
  return {
    id: row.id,
    title: row.title,
    width: row.width,
    height: row.height,
    dominantColor: row.dominant_color,
    mimeType: row.mime_type,
    byteSize: Number(row.byte_size),
    createdAt: row.created_at.toISOString(),
    favorite: row.favorite,
    tags: row.tags,
  };
}

export type ReferencePage = { items: ReferenceListItem[]; nextCursor: string | null; total: number | null };

export type ListOptions = {
  cursor?: Cursor | null;
  limit?: number;
  /** Only references linked to this project. */
  projectId?: string | null;
  /** Leave out references already in this collection / linked to this project (for pickers). */
  excludeCollection?: string | null;
  excludeProject?: string | null;
};

export async function listReferences(
  db: UserScopedDb,
  workspaceId: string,
  filters: LibraryFilters,
  options: ListOptions = {},
): Promise<ReferencePage> {
  const limit = Math.min(options.limit ?? PAGE_SIZE, 200);
  const params: unknown[] = [workspaceId];
  const bind = (value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
  };
  const where: string[] = ["r.workspace_id = $1"];

  if (filters.q) {
    // position() rather than LIKE, so %, _ and \ in a search are plain text.
    const q = bind(filters.q);
    where.push(
      `(position(lower(${q}) in lower(r.title)) > 0 or position(lower(${q}) in lower(r.description)) > 0
        or position(lower(${q}) in lower(r.original_filename)) > 0)`,
    );
  }
  for (const tag of filters.tags) {
    where.push(
      `exists (select 1 from public.library_reference_tags rt join public.library_tags t on t.id = rt.tag_id
               where rt.reference_id = r.id and lower(t.name) = lower(${bind(tag)}))`,
    );
  }
  if (filters.collection) {
    where.push(
      `exists (select 1 from public.library_collection_items ci where ci.reference_id = r.id and ci.collection_id = ${bind(filters.collection)})`,
    );
  }
  if (filters.view === "favorites") {
    where.push("exists (select 1 from public.library_favorites f where f.reference_id = r.id and f.user_id = app.current_user_id())");
  } else if (filters.view === "recent") {
    where.push(`r.created_at > now() - make_interval(days => ${bind(RECENT_DAYS)})`);
  } else if (filters.view === "unsorted") {
    where.push("not exists (select 1 from public.library_collection_items ci where ci.reference_id = r.id)");
  }
  if (options.projectId) {
    where.push(
      `exists (select 1 from public.library_reference_projects lp where lp.reference_id = r.id and lp.project_id = ${bind(options.projectId)})`,
    );
  }
  if (options.excludeCollection) {
    where.push(
      `not exists (select 1 from public.library_collection_items ci where ci.reference_id = r.id and ci.collection_id = ${bind(options.excludeCollection)})`,
    );
  }
  if (options.excludeProject) {
    where.push(
      `not exists (select 1 from public.library_reference_projects lp where lp.reference_id = r.id and lp.project_id = ${bind(options.excludeProject)})`,
    );
  }

  const order = ORDER[filters.sort];
  const filterWhere = [...where];
  const filterParams = params.length;
  if (options.cursor) {
    where.push(`${order.key} ${order.op} (${bind(options.cursor.value)}::${order.cursorType}, ${bind(options.cursor.id)}::uuid)`);
  }

  const { rows } = await db.query<ListRow>(
    `select ${SELECT_LIST}
     from public.library_references r
     where ${where.join(" and ")}
     order by ${order.by}
     limit ${bind(limit + 1)}`,
    params,
  );

  // The total is only worth its cost on the first page.
  let total: number | null = null;
  if (!options.cursor) {
    const counted = await db.query<{ total: number }>(
      `select count(*)::int as total from public.library_references r where ${filterWhere.join(" and ")}`,
      params.slice(0, filterParams),
    );
    total = counted.rows[0]?.total ?? 0;
  }

  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  const nextCursor =
    rows.length > limit && last
      ? encodeCursor({ value: order.cursorType === "timestamptz" ? last.created_cursor : last.title_cursor, id: last.id })
      : null;
  return { items: page.map(toListItem), nextCursor, total };
}

export async function countReferences(db: UserScopedDb, workspaceId: string): Promise<{ total: number; favorites: number }> {
  const { rows } = await db.query<{ total: number; favorites: number }>(
    `select count(*)::int as total,
            count(*) filter (where exists (
              select 1 from public.library_favorites f where f.reference_id = r.id and f.user_id = app.current_user_id()
            ))::int as favorites
     from public.library_references r where r.workspace_id = $1`,
    [workspaceId],
  );
  return rows[0] ?? { total: 0, favorites: 0 };
}

// ---------------------------------------------------------------------------
// One reference
// ---------------------------------------------------------------------------

type DetailRow = ListRow & {
  workspace_id: string;
  description: string;
  source_url: string | null;
  original_filename: string;
  metadata: ReferenceMetadata;
  updated_at: Date;
  created_by_name: string | null;
  can_delete: boolean;
  collections: { id: string; name: string }[];
  projects: { id: string; name: string; archived: boolean }[];
  moodboards: { id: string; name: string; uses: number }[];
};

export async function getReference(db: UserScopedDb, referenceId: string): Promise<ReferenceDetail | null> {
  const { rows } = await db.query<DetailRow>(
    `select ${SELECT_LIST},
       r.workspace_id, r.description, r.source_url, r.original_filename, r.metadata, r.updated_at,
       (select n.name from app.workspace_member_names(r.workspace_id) n where n.user_id = r.created_by) as created_by_name,
       (r.created_by = app.current_user_id() or app.workspace_role(r.workspace_id) = 'owner') as can_delete,
       coalesce((select json_agg(json_build_object('id', c.id, 'name', c.name) order by lower(c.name))
                 from public.library_collection_items ci join public.library_collections c on c.id = ci.collection_id
                 where ci.reference_id = r.id), '[]') as collections,
       coalesce((select json_agg(json_build_object('id', p.id, 'name', p.name, 'archived', p.archived_at is not null) order by lower(p.name))
                 from public.library_reference_projects lp join public.projects p on p.id = lp.project_id
                 where lp.reference_id = r.id), '[]') as projects,
       coalesce((select json_agg(json_build_object('id', b.id, 'name', b.name, 'uses', b.uses) order by lower(b.name))
                 from (select m.id, m.name, count(*)::int as uses
                       from public.moodboard_elements e join public.moodboards m on m.id = e.moodboard_id
                       where e.reference_id = r.id group by m.id, m.name) b), '[]') as moodboards
     from public.library_references r
     where r.id = $1`,
    [referenceId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    ...toListItem(row),
    workspaceId: row.workspace_id,
    description: row.description,
    sourceUrl: row.source_url,
    originalFilename: row.original_filename,
    metadata: row.metadata,
    createdByName: row.created_by_name,
    canDelete: row.can_delete,
    updatedAt: row.updated_at.toISOString(),
    collections: row.collections,
    projects: row.projects,
    moodboards: row.moodboards,
  };
}

/** Storage facts, for serving files. */
export async function getReferenceFile(
  db: UserScopedDb,
  referenceId: string,
): Promise<{ storageKey: string; mimeType: ImageType; sha256: string; originalFilename: string } | null> {
  const { rows } = await db.query<{ storage_key: string; mime_type: ImageType; sha256: string; original_filename: string }>(
    "select storage_key, mime_type, sha256, original_filename from public.library_references where id = $1",
    [referenceId],
  );
  const row = rows[0];
  return row ? { storageKey: row.storage_key, mimeType: row.mime_type, sha256: row.sha256, originalFilename: row.original_filename } : null;
}

export type NewReference = {
  workspaceId: string;
  createdBy: string;
  title: string;
  storageKey: string;
  originalFilename: string;
  mimeType: ImageType;
  byteSize: number;
  width: number;
  height: number;
  sha256: string;
  dominantColor: string;
  metadata: ReferenceMetadata;
};

export async function insertReference(db: UserScopedDb, input: NewReference): Promise<ReferenceListItem> {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.library_references
       (workspace_id, title, storage_key, original_filename, mime_type, byte_size, width, height, sha256, dominant_color, metadata, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     returning id`,
    [
      input.workspaceId,
      input.title,
      input.storageKey,
      input.originalFilename,
      input.mimeType,
      input.byteSize,
      input.width,
      input.height,
      input.sha256,
      input.dominantColor,
      JSON.stringify(input.metadata),
      input.createdBy,
    ],
  );
  const id = rows[0]!.id;
  const listed = await db.query<ListRow>(`select ${SELECT_LIST} from public.library_references r where r.id = $1`, [id]);
  return toListItem(listed.rows[0]!);
}

/** An earlier upload of the same bytes in this workspace, if any. */
export async function findDuplicate(db: UserScopedDb, workspaceId: string, sha256: string): Promise<{ id: string; title: string } | null> {
  const { rows } = await db.query<{ id: string; title: string }>(
    "select id, title from public.library_references where workspace_id = $1 and sha256 = $2 order by created_at limit 1",
    [workspaceId, sha256],
  );
  return rows[0] ?? null;
}

export async function updateReference(db: UserScopedDb, referenceId: string, input: ReferenceInput): Promise<boolean> {
  const { rowCount } = await db.query(
    "update public.library_references set title = $2, description = $3, source_url = $4 where id = $1",
    [referenceId, input.title, input.description, input.sourceUrl],
  );
  return rowCount === 1;
}

export async function getReferenceUsage(db: UserScopedDb, referenceId: string): Promise<ReferenceUsage> {
  const { rows } = await db.query<ReferenceUsage>(
    `select
       (select count(*)::int from public.library_collection_items where reference_id = $1) as collections,
       (select count(*)::int from public.library_reference_projects where reference_id = $1) as projects,
       (select count(distinct moodboard_id)::int from public.moodboard_elements where reference_id = $1) as moodboards,
       (select count(*)::int from public.moodboard_elements where reference_id = $1) as placements`,
    [referenceId],
  );
  return rows[0]!;
}

/**
 * Deletes the reference and, by cascade, its tags, favorites, collection
 * memberships, project links and moodboard placements. Returns the storage
 * key so the caller can remove the files, or null if nothing was deleted
 * (not visible, or not the uploader or an owner).
 */
export async function deleteReference(db: UserScopedDb, referenceId: string): Promise<string | null> {
  const { rows } = await db.query<{ storage_key: string }>(
    "delete from public.library_references where id = $1 returning storage_key",
    [referenceId],
  );
  return rows[0]?.storage_key ?? null;
}

// ---------------------------------------------------------------------------
// Favorites
// ---------------------------------------------------------------------------

export async function setFavorite(db: UserScopedDb, userId: string, referenceId: string, favorite: boolean): Promise<boolean> {
  if (favorite) {
    const { rowCount } = await db.query(
      `insert into public.library_favorites (user_id, reference_id, workspace_id)
       select $1, r.id, r.workspace_id from public.library_references r where r.id = $2
       on conflict do nothing`,
      [userId, referenceId],
    );
    if (rowCount === 1) return true;
  } else {
    await db.query("delete from public.library_favorites where user_id = $1 and reference_id = $2", [userId, referenceId]);
  }
  const visible = await db.query("select 1 from public.library_references where id = $1", [referenceId]);
  return visible.rowCount === 1;
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

export async function listLibraryTags(db: UserScopedDb, workspaceId: string): Promise<TagCount[]> {
  const { rows } = await db.query<TagCount>(
    `select t.id, t.name, count(rt.reference_id)::int as count
     from public.library_tags t
     left join public.library_reference_tags rt on rt.tag_id = t.id
     where t.workspace_id = $1
     group by t.id
     order by lower(t.name)`,
    [workspaceId],
  );
  return rows;
}

/** Makes the reference carry exactly these tags, creating any new ones (case-insensitively reused). */
export async function setReferenceTags(db: UserScopedDb, referenceId: string, names: string[]): Promise<boolean> {
  const tags = normalizeTags(names);
  const reference = await db.query<{ workspace_id: string }>(
    "select workspace_id from public.library_references where id = $1",
    [referenceId],
  );
  const workspaceId = reference.rows[0]?.workspace_id;
  if (!workspaceId) return false;

  if (tags.length > 0) {
    await db.query(
      `insert into public.library_tags (workspace_id, name)
       select $1, name from unnest($2::text[]) as name
       on conflict (workspace_id, lower(name)) do nothing`,
      [workspaceId, tags],
    );
  }
  await db.query(
    `delete from public.library_reference_tags rt
     using public.library_tags t
     where rt.reference_id = $1 and t.id = rt.tag_id and not (lower(t.name) = any (select lower(unnest($2::text[]))))`,
    [referenceId, tags],
  );
  if (tags.length > 0) {
    await db.query(
      `insert into public.library_reference_tags (reference_id, tag_id, workspace_id)
       select $1, t.id, t.workspace_id from public.library_tags t
       where t.workspace_id = $2 and lower(t.name) = any (select lower(unnest($3::text[])))
       on conflict do nothing`,
      [referenceId, workspaceId, tags],
    );
  }
  return true;
}

/** Adds one tag to many references at once. */
export async function addTagToReferences(db: UserScopedDb, workspaceId: string, name: string, referenceIds: string[]): Promise<number> {
  await db.query(
    "insert into public.library_tags (workspace_id, name) values ($1, $2) on conflict (workspace_id, lower(name)) do nothing",
    [workspaceId, name],
  );
  const { rowCount } = await db.query(
    `insert into public.library_reference_tags (reference_id, tag_id, workspace_id)
     select r.id, t.id, r.workspace_id
     from public.library_references r
     join public.library_tags t on t.workspace_id = r.workspace_id and lower(t.name) = lower($2)
     where r.workspace_id = $1 and r.id = any ($3::uuid[])
     on conflict do nothing`,
    [workspaceId, name, referenceIds],
  );
  return rowCount ?? 0;
}

export async function renameLibraryTag(db: UserScopedDb, tagId: string, name: string): Promise<boolean> {
  try {
    const { rowCount } = await db.query("update public.library_tags set name = $2 where id = $1", [tagId, name]);
    return rowCount === 1;
  } catch (error) {
    if (pgCode(error) === PG.UNIQUE_VIOLATION) throw new LibraryError("name_taken", "A tag with that name already exists.");
    throw error;
  }
}

export async function deleteLibraryTag(db: UserScopedDb, tagId: string): Promise<boolean> {
  const { rowCount } = await db.query("delete from public.library_tags where id = $1", [tagId]);
  return rowCount === 1;
}

// ---------------------------------------------------------------------------
// Project links
// ---------------------------------------------------------------------------

function translateLinkError(error: unknown): never {
  if (pgCode(error) === PG.OBJECT_NOT_IN_STATE) {
    throw new LibraryError("archived", "That project is archived. Restore it before changing its references.");
  }
  if (pgCode(error) === PG.FOREIGN_KEY_VIOLATION) {
    throw new LibraryError("invalid_reference", "That project or reference is not in this workspace.");
  }
  throw error;
}

/** Links references to a project. Only same-workspace pairs can be linked (composite keys). */
export async function linkReferencesToProject(db: UserScopedDb, projectId: string, referenceIds: string[]): Promise<number> {
  try {
    const { rowCount } = await db.query(
      `insert into public.library_reference_projects (reference_id, project_id, workspace_id)
       select r.id, p.id, p.workspace_id
       from public.projects p
       join public.library_references r on r.workspace_id = p.workspace_id and r.id = any ($2::uuid[])
       where p.id = $1
       on conflict do nothing`,
      [projectId, referenceIds],
    );
    return rowCount ?? 0;
  } catch (error) {
    translateLinkError(error);
  }
}

export async function unlinkReferenceFromProject(db: UserScopedDb, projectId: string, referenceId: string): Promise<boolean> {
  try {
    const { rowCount } = await db.query(
      "delete from public.library_reference_projects where project_id = $1 and reference_id = $2",
      [projectId, referenceId],
    );
    return rowCount === 1;
  } catch (error) {
    translateLinkError(error);
  }
}

export type ProjectChoice = { id: string; name: string; archived: boolean };

/** Projects in the workspace, for "link to project" pickers. Archived ones are listed but marked. */
export async function listProjectChoices(db: UserScopedDb, workspaceId: string): Promise<ProjectChoice[]> {
  const { rows } = await db.query<ProjectChoice>(
    `select p.id, p.name, p.archived_at is not null as archived
     from public.projects p where p.workspace_id = $1
     order by p.archived_at is not null, lower(p.name)`,
    [workspaceId],
  );
  return rows;
}
