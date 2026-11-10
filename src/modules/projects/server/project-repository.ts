import type { UserScopedDb } from "@/infrastructure/db/user-scope";
import { PG, ProjectsError, pgCode, rethrowArchived } from "../domain/errors";
import {
  PAGE_SIZE,
  type CustomField,
  type Hue,
  type Priority,
  type ProjectDetail,
  type ProjectFilters,
  type ProjectInput,
  type ProjectListItem,
  type Sort,
  type StatusKind,
  type TagCount,
} from "../domain/project";

// All queries run under RLS as the acting user (see runAsUser). Every query
// also names the workspace, because a user can belong to several.

type ListRow = {
  id: string;
  name: string;
  client: string;
  priority: Priority;
  due_date: string | null;
  start_date: string | null;
  archived_at: Date | null;
  updated_at: Date;
  status_id: string;
  status_name: string;
  status_kind: StatusKind;
  status_color: Hue;
  status_position: number;
  category_id: string | null;
  category_name: string | null;
  category_color: Hue | null;
  tags: string[];
  note_count: number;
  total: number;
};

type DetailRow = ListRow & {
  workspace_id: string;
  description: string;
  custom_fields: CustomField[];
  created_at: Date;
  created_by_name: string | null;
  archived_by_name: string | null;
};

const SELECT_LIST = `
  p.id, p.name, p.client, p.priority, p.due_date::text as due_date, p.start_date::text as start_date,
  p.archived_at, p.updated_at,
  s.id as status_id, s.name as status_name, s.kind as status_kind, s.color as status_color, s.position as status_position,
  c.id as category_id, c.name as category_name, c.color as category_color,
  coalesce((
    select array_agg(t.name order by lower(t.name))
    from public.project_tag_links l join public.project_tags t on t.id = l.tag_id
    where l.project_id = p.id
  ), '{}') as tags,
  (select count(*)::int from public.project_notes n where n.project_id = p.id) as note_count
`;

const FROM_LIST = `
  from public.projects p
  join public.project_statuses s on s.id = p.status_id
  left join public.project_categories c on c.id = p.category_id
`;

/** Fixed fragments only: user input never reaches the ORDER BY. */
const ORDER_BY: Record<Sort, string> = {
  updated: "p.updated_at desc, p.id",
  created: "p.created_at desc, p.id",
  due: "p.due_date asc nulls last, p.updated_at desc, p.id",
  name: "lower(p.name), p.id",
  priority:
    "case p.priority when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end, p.updated_at desc, p.id",
};

function toListItem(row: ListRow): ProjectListItem {
  return {
    id: row.id,
    name: row.name,
    client: row.client,
    priority: row.priority,
    dueDate: row.due_date,
    startDate: row.start_date,
    archivedAt: row.archived_at,
    updatedAt: row.updated_at,
    status: { id: row.status_id, name: row.status_name, kind: row.status_kind, color: row.status_color, position: row.status_position },
    category: row.category_id ? { id: row.category_id, name: row.category_name!, color: row.category_color! } : null,
    tags: row.tags,
    noteCount: row.note_count,
  };
}

export type ProjectPage = { items: ProjectListItem[]; total: number };

export async function listProjects(
  db: UserScopedDb,
  workspaceId: string,
  filters: ProjectFilters,
  options: { limit?: number } = {},
): Promise<ProjectPage> {
  const limit = options.limit ?? PAGE_SIZE;
  const params: unknown[] = [workspaceId];
  const where: string[] = ["p.workspace_id = $1"];
  const bind = (value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
  };

  if (filters.view === "active") where.push("p.archived_at is null");
  if (filters.view === "archived") where.push("p.archived_at is not null");
  if (filters.q) {
    // position() instead of LIKE, so %, _ and \ in the search are plain text.
    const q = bind(filters.q);
    where.push(
      `(position(lower(${q}) in lower(p.name)) > 0 or position(lower(${q}) in lower(p.client)) > 0 or position(lower(${q}) in lower(p.description)) > 0)`,
    );
  }
  if (filters.status) where.push(`p.status_id = ${bind(filters.status)}`);
  if (filters.category === "none") where.push("p.category_id is null");
  else if (filters.category) where.push(`p.category_id = ${bind(filters.category)}`);
  if (filters.tag) {
    where.push(
      `exists (select 1 from public.project_tag_links l join public.project_tags t on t.id = l.tag_id
               where l.project_id = p.id and lower(t.name) = lower(${bind(filters.tag)}))`,
    );
  }

  const offset = (filters.page - 1) * limit;
  const limitParam = bind(limit);
  const offsetParam = bind(offset);
  const { rows } = await db.query<ListRow>(
    `select ${SELECT_LIST}, count(*) over ()::int as total
     ${FROM_LIST}
     where ${where.join(" and ")}
     order by ${ORDER_BY[filters.sort]}
     limit ${limitParam} offset ${offsetParam}`,
    params,
  );

  if (rows.length === 0 && filters.page > 1) {
    // Past the last page: the window count is gone with the rows, so ask directly.
    const counted = await db.query<{ total: number }>(
      `select count(*)::int as total ${FROM_LIST} where ${where.join(" and ")}`,
      params.slice(0, params.length - 2),
    );
    return { items: [], total: counted.rows[0]?.total ?? 0 };
  }
  return { items: rows.map(toListItem), total: rows[0]?.total ?? 0 };
}

export async function getProject(db: UserScopedDb, projectId: string): Promise<(ProjectDetail & { workspaceId: string }) | null> {
  const { rows } = await db.query<DetailRow>(
    `select ${SELECT_LIST}, p.workspace_id, p.description, p.custom_fields, p.created_at,
            creator.name as created_by_name, archiver.name as archived_by_name, 1 as total
     ${FROM_LIST}
     left join lateral (select m.name from app.workspace_member_names(p.workspace_id) m where m.user_id = p.created_by) creator on true
     left join lateral (select m.name from app.workspace_member_names(p.workspace_id) m where m.user_id = p.archived_by) archiver on true
     where p.id = $1`,
    [projectId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    ...toListItem(row),
    workspaceId: row.workspace_id,
    description: row.description,
    customFields: row.custom_fields,
    createdAt: row.created_at,
    createdByName: row.created_by_name,
    archivedByName: row.archived_by_name,
  };
}

/** Tags in use in the workspace, with how many projects carry each. */
export async function listTags(db: UserScopedDb, workspaceId: string): Promise<TagCount[]> {
  const { rows } = await db.query<{ name: string; count: number }>(
    `select t.name, count(*)::int as count
     from public.project_tags t join public.project_tag_links l on l.tag_id = t.id
     where t.workspace_id = $1
     group by t.id order by lower(t.name)`,
    [workspaceId],
  );
  return rows;
}

/** Makes the project's tags exactly `names`, creating tags as needed. Reuses existing spellings. */
async function setProjectTags(db: UserScopedDb, workspaceId: string, projectId: string, names: string[]): Promise<void> {
  if (names.length > 0) {
    await db.query(
      `insert into public.project_tags (workspace_id, name)
       select $1, n from unnest($2::text[]) as n
       on conflict (workspace_id, lower(name)) do nothing`,
      [workspaceId, names],
    );
  }
  const wanted = await db.query<{ id: string }>(
    `select id from public.project_tags where workspace_id = $1 and lower(name) = any($2::text[])`,
    [workspaceId, names.map((name) => name.toLowerCase())],
  );
  const ids = wanted.rows.map((row) => row.id);
  await db.query(`delete from public.project_tag_links where project_id = $1 and tag_id <> all($2::uuid[])`, [projectId, ids]);
  if (ids.length > 0) {
    await db.query(
      `insert into public.project_tag_links (project_id, tag_id, workspace_id)
       select $1, t, $2 from unnest($3::uuid[]) as t
       on conflict (project_id, tag_id) do nothing`,
      [projectId, workspaceId, ids],
    );
  }
}

function invalidReference(error: unknown): never {
  if (pgCode(error) === PG.FOREIGN_KEY_VIOLATION) {
    throw new ProjectsError("invalid_reference", "Choose a status and category that belong to this workspace.");
  }
  throw error;
}

/** Returns the new project's id. */
export async function createProject(
  db: UserScopedDb,
  workspaceId: string,
  userId: string,
  input: ProjectInput,
): Promise<string> {
  let id: string;
  try {
    const { rows } = await db.query<{ id: string }>(
      `insert into public.projects
         (workspace_id, name, description, status_id, category_id, client, priority, start_date, due_date, custom_fields, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11)
       returning id`,
      [
        workspaceId,
        input.name,
        input.description,
        input.statusId,
        input.categoryId,
        input.client,
        input.priority,
        input.startDate,
        input.dueDate,
        JSON.stringify(input.customFields),
        userId,
      ],
    );
    id = rows[0]!.id;
  } catch (error) {
    return invalidReference(error);
  }
  await setProjectTags(db, workspaceId, id, input.tags);
  return id;
}

/** Returns false when the project is not visible to the user. Throws `archived` for archived projects. */
export async function updateProject(db: UserScopedDb, projectId: string, input: ProjectInput): Promise<boolean> {
  let workspaceId: string | undefined;
  try {
    const { rows } = await db.query<{ workspace_id: string }>(
      `update public.projects set name = $2, description = $3, status_id = $4, category_id = $5, client = $6,
              priority = $7, start_date = $8, due_date = $9, custom_fields = $10::jsonb
       where id = $1
       returning workspace_id`,
      [
        projectId,
        input.name,
        input.description,
        input.statusId,
        input.categoryId,
        input.client,
        input.priority,
        input.startDate,
        input.dueDate,
        JSON.stringify(input.customFields),
      ],
    );
    workspaceId = rows[0]?.workspace_id;
  } catch (error) {
    if (pgCode(error) === PG.OBJECT_NOT_IN_STATE) rethrowArchived(error);
    return invalidReference(error);
  }
  if (!workspaceId) return false;
  try {
    await setProjectTags(db, workspaceId, projectId, input.tags);
  } catch (error) {
    rethrowArchived(error);
  }
  return true;
}

/** Quick status change from the project header. */
export async function setProjectStatus(db: UserScopedDb, projectId: string, statusId: string): Promise<boolean> {
  try {
    const result = await db.query("update public.projects set status_id = $2 where id = $1", [projectId, statusId]);
    return result.rowCount === 1;
  } catch (error) {
    if (pgCode(error) === PG.OBJECT_NOT_IN_STATE) rethrowArchived(error);
    return invalidReference(error);
  }
}

/** Archiving is idempotent. Returns false when the project is not visible. */
export async function setProjectArchived(db: UserScopedDb, projectId: string, archived: boolean): Promise<boolean> {
  const result = await db.query(
    `update public.projects
     set archived_at = case when $2::boolean then coalesce(archived_at, now()) else null end
     where id = $1`,
    [projectId, archived],
  );
  return result.rowCount === 1;
}
