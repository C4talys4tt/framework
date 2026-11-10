import type { UserScopedDb } from "@/infrastructure/db/user-scope";
import { ARCHIVED_PROJECT_MESSAGE, LibraryError, PG, pgCode } from "../domain/errors";
import {
  DEFAULT_TEXT_STYLE,
  type BoardElement,
  type BoardImage,
  type LayoutSave,
  type MoodboardDetail,
  type MoodboardInput,
  type MoodboardSort,
  type MoodboardSummary,
  type TextStyle,
} from "../domain/moodboard";

type SummaryRow = {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  background: string;
  version: number;
  project_id: string | null;
  project_name: string | null;
  element_count: number;
  previews: { id: string; dominantColor: string }[];
  updated_at: Date;
  can_delete: boolean;
};

const SELECT_SUMMARY = `
  select m.id, m.workspace_id, m.name, m.description, m.background, m.version, m.updated_at, m.created_at,
    p.id as project_id, p.name as project_name,
    (select count(*)::int from public.moodboard_elements e where e.moodboard_id = m.id) as element_count,
    coalesce((
      select json_agg(json_build_object('id', x.id, 'dominantColor', x.dominant_color))
      from (
        select r.id, r.dominant_color, max(e.z) as top
        from public.moodboard_elements e join public.library_references r on r.id = e.reference_id
        where e.moodboard_id = m.id
        group by r.id, r.dominant_color
        order by top desc
        limit 4
      ) x
    ), '[]') as previews,
    (m.created_by = app.current_user_id() or app.workspace_role(m.workspace_id) = 'owner') as can_delete
  from public.moodboards m
  left join public.projects p on p.id = m.project_id
`;

const ORDER: Record<MoodboardSort, string> = {
  updated: "updated_at desc, id",
  name: "lower(name), id",
  created: "created_at desc, id",
};

function toSummary(row: SummaryRow): MoodboardSummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    background: row.background,
    project: row.project_id ? { id: row.project_id, name: row.project_name ?? "" } : null,
    elementCount: row.element_count,
    previews: row.previews,
    updatedAt: row.updated_at.toISOString(),
    canDelete: row.can_delete,
  };
}

export async function listMoodboards(
  db: UserScopedDb,
  workspaceId: string,
  options: { projectId?: string | null; q?: string; sort?: MoodboardSort } = {},
): Promise<MoodboardSummary[]> {
  const params: unknown[] = [workspaceId];
  const where = ["m.workspace_id = $1"];
  if (options.projectId) {
    params.push(options.projectId);
    where.push(`m.project_id = $${params.length}`);
  }
  if (options.q) {
    params.push(options.q);
    where.push(`(position(lower($${params.length}) in lower(m.name)) > 0 or position(lower($${params.length}) in lower(m.description)) > 0)`);
  }
  const { rows } = await db.query<SummaryRow>(
    `select * from (${SELECT_SUMMARY} where ${where.join(" and ")}) listed order by ${ORDER[options.sort ?? "updated"]}`,
    params,
  );
  return rows.map(toSummary);
}

type ElementRow = {
  id: string;
  kind: "image" | "text";
  reference_id: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  z: number;
  text: string;
  style: Partial<TextStyle>;
};

function toElement(row: ElementRow): BoardElement {
  const geometry = { id: row.id, x: row.x, y: row.y, width: row.width, height: row.height, z: row.z };
  if (row.kind === "image") return { ...geometry, kind: "image", referenceId: row.reference_id! };
  return { ...geometry, kind: "text", text: row.text, style: { ...DEFAULT_TEXT_STYLE, ...row.style } };
}

export async function getMoodboard(db: UserScopedDb, moodboardId: string): Promise<MoodboardDetail | null> {
  const { rows } = await db.query<SummaryRow>(`${SELECT_SUMMARY} where m.id = $1`, [moodboardId]);
  const row = rows[0];
  if (!row) return null;
  const elements = await db.query<ElementRow>(
    `select id, kind, reference_id, x, y, width, height, z, text, style
     from public.moodboard_elements where moodboard_id = $1 order by z, id`,
    [moodboardId],
  );
  const images = await db.query<{ id: string; title: string; width: number; height: number; dominant_color: string }>(
    `select distinct r.id, r.title, r.width, r.height, r.dominant_color
     from public.moodboard_elements e join public.library_references r on r.id = e.reference_id
     where e.moodboard_id = $1`,
    [moodboardId],
  );
  const imageMap: Record<string, BoardImage> = {};
  for (const image of images.rows) {
    imageMap[image.id] = { id: image.id, title: image.title, width: image.width, height: image.height, dominantColor: image.dominant_color };
  }
  return {
    ...toSummary(row),
    workspaceId: row.workspace_id,
    version: row.version,
    document: { background: row.background, elements: elements.rows.map(toElement) },
    images: imageMap,
  };
}

function translate(error: unknown): never {
  if (pgCode(error) === PG.OBJECT_NOT_IN_STATE) throw new LibraryError("archived", ARCHIVED_PROJECT_MESSAGE);
  if (pgCode(error) === PG.FOREIGN_KEY_VIOLATION) throw new LibraryError("invalid_reference", "That project is not in this workspace.");
  throw error;
}

export async function createMoodboard(db: UserScopedDb, workspaceId: string, userId: string, input: MoodboardInput): Promise<string> {
  try {
    const { rows } = await db.query<{ id: string }>(
      `insert into public.moodboards (workspace_id, name, description, project_id, created_by)
       values ($1, $2, $3, $4, $5) returning id`,
      [workspaceId, input.name, input.description, input.projectId, userId],
    );
    return rows[0]!.id;
  } catch (error) {
    translate(error);
  }
}

export async function updateMoodboard(db: UserScopedDb, moodboardId: string, input: MoodboardInput): Promise<boolean> {
  try {
    const { rowCount } = await db.query(
      "update public.moodboards set name = $2, description = $3, project_id = $4 where id = $1",
      [moodboardId, input.name, input.description, input.projectId],
    );
    return rowCount === 1;
  } catch (error) {
    translate(error);
  }
}

/** Copies a board and every element (new ids, same references). Keeps its project unless that is archived. */
export async function duplicateMoodboard(db: UserScopedDb, moodboardId: string, userId: string): Promise<string | null> {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.moodboards (workspace_id, name, description, project_id, background, created_by)
     select m.workspace_id, left('Copy of ' || m.name, 120), m.description,
            case when p.archived_at is null then m.project_id end, m.background, $2
     from public.moodboards m left join public.projects p on p.id = m.project_id
     where m.id = $1
     returning id`,
    [moodboardId, userId],
  );
  const copy = rows[0]?.id;
  if (!copy) return null;
  await db.query(
    `insert into public.moodboard_elements (id, moodboard_id, workspace_id, kind, reference_id, x, y, width, height, z, text, style)
     select gen_random_uuid(), $2, e.workspace_id, e.kind, e.reference_id, e.x, e.y, e.width, e.height, e.z, e.text, e.style
     from public.moodboard_elements e where e.moodboard_id = $1`,
    [moodboardId, copy],
  );
  return copy;
}

export async function deleteMoodboard(db: UserScopedDb, moodboardId: string): Promise<boolean> {
  const { rowCount } = await db.query("delete from public.moodboards where id = $1", [moodboardId]);
  return rowCount === 1;
}

export type SaveLayoutResult =
  | { status: "saved"; version: number; dropped: string[] }
  | { status: "conflict"; version: number }
  | { status: "not_found" };

/**
 * Makes the board's stored layout exactly `save` in one transaction, if it is
 * still at `save.baseVersion`. Elements whose image has been deleted from the
 * library since the editor loaded are dropped (and reported) rather than
 * failing the whole save.
 */
export async function saveLayout(db: UserScopedDb, moodboardId: string, save: LayoutSave): Promise<SaveLayoutResult> {
  // FOR UPDATE serialises concurrent saves to one board.
  const locked = await db.query<{ workspace_id: string; version: number }>(
    "select workspace_id, version from public.moodboards where id = $1 for update",
    [moodboardId],
  );
  const board = locked.rows[0];
  if (!board) return { status: "not_found" };
  if (board.version !== save.baseVersion) return { status: "conflict", version: board.version };

  const referenceIds = [...new Set(save.elements.flatMap((element) => (element.kind === "image" ? [element.referenceId] : [])))];
  const present = new Set<string>();
  if (referenceIds.length > 0) {
    const found = await db.query<{ id: string }>(
      "select id from public.library_references where workspace_id = $1 and id = any ($2::uuid[])",
      [board.workspace_id, referenceIds],
    );
    for (const row of found.rows) present.add(row.id);
  }
  const dropped: string[] = [];
  const elements = save.elements.filter((element) => {
    if (element.kind === "image" && !present.has(element.referenceId)) {
      dropped.push(element.id);
      return false;
    }
    return true;
  });

  await db.query("delete from public.moodboard_elements where moodboard_id = $1 and not (id = any ($2::uuid[]))", [
    moodboardId,
    elements.map((element) => element.id),
  ]);

  if (elements.length > 0) {
    const records = elements.map((element) => ({
      id: element.id,
      kind: element.kind,
      reference_id: element.kind === "image" ? element.referenceId : null,
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
      z: element.z,
      text: element.kind === "text" ? element.text : "",
      style: element.kind === "text" ? element.style : {},
    }));
    const upserted = await db.query(
      `insert into public.moodboard_elements (id, moodboard_id, workspace_id, kind, reference_id, x, y, width, height, z, text, style)
       select e.id, $1, $2, e.kind, e.reference_id, e.x, e.y, e.width, e.height, e.z, e.text, e.style
       from jsonb_to_recordset($3::jsonb) as e(
         id uuid, kind text, reference_id uuid, x double precision, y double precision,
         width double precision, height double precision, z integer, text text, style jsonb)
       on conflict (id) do update set
         x = excluded.x, y = excluded.y, width = excluded.width, height = excluded.height,
         z = excluded.z, text = excluded.text, style = excluded.style
       -- An id that belongs to a different board is never taken over.
       where public.moodboard_elements.moodboard_id = excluded.moodboard_id
         and public.moodboard_elements.kind = excluded.kind`,
      [moodboardId, board.workspace_id, JSON.stringify(records)],
    );
    if (upserted.rowCount !== elements.length) {
      throw new LibraryError("invalid_reference", "Some items on this board could not be saved. Reload the board and try again.");
    }
  }

  const updated = await db.query<{ version: number }>(
    "update public.moodboards set background = $2, version = version + 1 where id = $1 returning version",
    [moodboardId, save.background],
  );
  return { status: "saved", version: updated.rows[0]!.version, dropped };
}

/** Projects a board can be assigned to (active only). */
export async function listActiveProjects(db: UserScopedDb, workspaceId: string): Promise<{ id: string; name: string }[]> {
  const { rows } = await db.query<{ id: string; name: string }>(
    "select id, name from public.projects where workspace_id = $1 and archived_at is null order by lower(name)",
    [workspaceId],
  );
  return rows;
}
