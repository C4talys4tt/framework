import type { UserScopedDb } from "@/infrastructure/db/user-scope";
import { LibraryError, PG, pgCode } from "../domain/errors";
import type { CollectionInput, CollectionSort, CollectionSummary } from "../domain/reference";

type Row = {
  id: string;
  name: string;
  description: string;
  count: number;
  cover_id: string | null;
  cover_color: string | null;
  cover_explicit: boolean;
  previews: { id: string; dominantColor: string }[];
  updated_at: Date;
  can_delete: boolean;
};

const ORDER: Record<CollectionSort, string> = {
  updated: "updated_at desc, id",
  name: "lower(name), id",
  created: "created_at desc, id",
  size: "count desc, lower(name), id",
};

// The cover, the strip and the count are worked out in one pass per collection.
const SELECT = `
  select c.id, c.workspace_id, c.name, c.description, c.created_at,
    -- Adding or removing references counts as a change to the collection.
    greatest(c.updated_at, coalesce((select max(ci.added_at) from public.library_collection_items ci where ci.collection_id = c.id), c.updated_at)) as updated_at,
    (select count(*)::int from public.library_collection_items ci where ci.collection_id = c.id) as count,
    cover.id as cover_id, cover.dominant_color as cover_color, c.cover_reference_id is not null as cover_explicit,
    coalesce((
      select json_agg(json_build_object('id', p.id, 'dominantColor', p.dominant_color))
      from (
        select r.id, r.dominant_color
        from public.library_collection_items ci join public.library_references r on r.id = ci.reference_id
        where ci.collection_id = c.id and r.id is distinct from cover.id
        order by ci.added_at desc, r.id
        limit 3
      ) p
    ), '[]') as previews,
    (c.created_by = app.current_user_id() or app.workspace_role(c.workspace_id) = 'owner') as can_delete
  from public.library_collections c
  left join lateral (
    select r.id, r.dominant_color
    from public.library_references r
    where r.id = c.cover_reference_id
    union all
    -- Only when there is no explicit cover, so at most one row comes back.
    (select r.id, r.dominant_color
     from public.library_collection_items ci join public.library_references r on r.id = ci.reference_id
     where ci.collection_id = c.id and c.cover_reference_id is null
     order by ci.added_at desc, r.id
     limit 1)
  ) cover on true
`;

function toSummary(row: Row): CollectionSummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    count: row.count,
    cover: row.cover_id ? { id: row.cover_id, dominantColor: row.cover_color ?? "#1a1d22" } : null,
    coverIsExplicit: row.cover_explicit,
    previews: row.previews,
    updatedAt: row.updated_at.toISOString(),
    canDelete: row.can_delete,
  };
}

export async function listCollections(
  db: UserScopedDb,
  workspaceId: string,
  options: { q?: string; sort?: CollectionSort } = {},
): Promise<CollectionSummary[]> {
  const params: unknown[] = [workspaceId];
  let search = "";
  if (options.q) {
    params.push(options.q);
    search = "and (position(lower($2) in lower(c.name)) > 0 or position(lower($2) in lower(c.description)) > 0)";
  }
  const { rows } = await db.query<Row>(
    `select * from (${SELECT} where c.workspace_id = $1 ${search}) listed order by ${ORDER[options.sort ?? "updated"]}`,
    params,
  );
  return rows.map(toSummary);
}

export async function getCollection(db: UserScopedDb, collectionId: string): Promise<(CollectionSummary & { workspaceId: string }) | null> {
  const { rows } = await db.query<Row & { workspace_id: string }>(
    `${SELECT} where c.id = $1`,
    [collectionId],
  );
  const row = rows[0];
  return row ? { ...toSummary(row), workspaceId: row.workspace_id } : null;
}

function translate(error: unknown): never {
  if (pgCode(error) === PG.UNIQUE_VIOLATION) throw new LibraryError("name_taken", "A collection with that name already exists.");
  throw error;
}

export async function createCollection(db: UserScopedDb, workspaceId: string, userId: string, input: CollectionInput): Promise<string> {
  try {
    const { rows } = await db.query<{ id: string }>(
      "insert into public.library_collections (workspace_id, name, description, created_by) values ($1, $2, $3, $4) returning id",
      [workspaceId, input.name, input.description, userId],
    );
    return rows[0]!.id;
  } catch (error) {
    translate(error);
  }
}

export async function updateCollection(db: UserScopedDb, collectionId: string, input: CollectionInput): Promise<boolean> {
  try {
    const { rowCount } = await db.query("update public.library_collections set name = $2, description = $3 where id = $1", [
      collectionId,
      input.name,
      input.description,
    ]);
    return rowCount === 1;
  } catch (error) {
    translate(error);
  }
}

/** Deletes the collection only. Its references stay in the library. */
export async function deleteCollection(db: UserScopedDb, collectionId: string): Promise<boolean> {
  const { rowCount } = await db.query("delete from public.library_collections where id = $1", [collectionId]);
  return rowCount === 1;
}

/** Adds references (same workspace only). Returns how many were newly added. */
export async function addToCollection(db: UserScopedDb, collectionId: string, referenceIds: string[]): Promise<number | null> {
  const collection = await db.query("select 1 from public.library_collections where id = $1", [collectionId]);
  if (collection.rowCount !== 1) return null;
  const { rowCount } = await db.query(
    `insert into public.library_collection_items (collection_id, reference_id, workspace_id)
     select c.id, r.id, c.workspace_id
     from public.library_collections c
     join public.library_references r on r.workspace_id = c.workspace_id and r.id = any ($2::uuid[])
     where c.id = $1
     on conflict do nothing`,
    [collectionId, referenceIds],
  );
  return rowCount ?? 0;
}

export async function removeFromCollection(db: UserScopedDb, collectionId: string, referenceId: string): Promise<boolean> {
  const { rowCount } = await db.query(
    "delete from public.library_collection_items where collection_id = $1 and reference_id = $2",
    [collectionId, referenceId],
  );
  return rowCount === 1;
}

/** Sets an explicit cover; it must already be in the collection. Null goes back to automatic. */
export async function setCollectionCover(db: UserScopedDb, collectionId: string, referenceId: string | null): Promise<boolean> {
  if (referenceId) {
    const member = await db.query(
      "select 1 from public.library_collection_items where collection_id = $1 and reference_id = $2",
      [collectionId, referenceId],
    );
    if (member.rowCount !== 1) return false;
  }
  const { rowCount } = await db.query("update public.library_collections set cover_reference_id = $2 where id = $1", [
    collectionId,
    referenceId,
  ]);
  return rowCount === 1;
}

/** Names of the collections a reference is in, keyed for quick "add to collection" menus. */
export async function listCollectionChoices(db: UserScopedDb, workspaceId: string): Promise<{ id: string; name: string }[]> {
  const { rows } = await db.query<{ id: string; name: string }>(
    "select id, name from public.library_collections where workspace_id = $1 order by lower(name)",
    [workspaceId],
  );
  return rows;
}
