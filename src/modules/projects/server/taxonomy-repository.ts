import type { UserScopedDb } from "@/infrastructure/db/user-scope";
import { PG, ProjectsError, pgCode } from "../domain/errors";
import type { Hue, ProjectCategory, ProjectStatus, StatusKind } from "../domain/project";

// Statuses and categories are readable by every member and writable by owners
// only; the policies decide, so a member's write simply matches no rows.

type StatusRow = { id: string; name: string; kind: StatusKind; color: Hue; position: number };
type CategoryRow = { id: string; name: string; color: Hue };
type StatusInput = { name: string; kind: StatusKind; color: Hue };
type CategoryInput = { name: string; color: Hue };

export type StatusWithUsage = ProjectStatus & { projectCount: number };
export type CategoryWithUsage = ProjectCategory & { projectCount: number };

export async function listStatuses(db: UserScopedDb, workspaceId: string): Promise<ProjectStatus[]> {
  const { rows } = await db.query<StatusRow>(
    `select id, name, kind, color, position from public.project_statuses
     where workspace_id = $1 order by position, created_at, id`,
    [workspaceId],
  );
  return rows;
}

export async function listCategories(db: UserScopedDb, workspaceId: string): Promise<ProjectCategory[]> {
  const { rows } = await db.query<CategoryRow>(
    `select id, name, color from public.project_categories where workspace_id = $1 order by lower(name), id`,
    [workspaceId],
  );
  return rows;
}

export async function listStatusesWithUsage(db: UserScopedDb, workspaceId: string): Promise<StatusWithUsage[]> {
  const { rows } = await db.query<StatusRow & { project_count: number }>(
    `select s.id, s.name, s.kind, s.color, s.position,
            (select count(*)::int from public.projects p where p.status_id = s.id) as project_count
     from public.project_statuses s where s.workspace_id = $1 order by s.position, s.created_at, s.id`,
    [workspaceId],
  );
  return rows.map(({ project_count, ...status }) => ({ ...status, projectCount: project_count }));
}

export async function listCategoriesWithUsage(db: UserScopedDb, workspaceId: string): Promise<CategoryWithUsage[]> {
  const { rows } = await db.query<CategoryRow & { project_count: number }>(
    `select c.id, c.name, c.color,
            (select count(*)::int from public.projects p where p.category_id = c.id) as project_count
     from public.project_categories c where c.workspace_id = $1 order by lower(c.name), c.id`,
    [workspaceId],
  );
  return rows.map(({ project_count, ...category }) => ({ ...category, projectCount: project_count }));
}

/** Cheap pre-check so a member gets a clean "not allowed" rather than an aborted transaction. RLS still enforces it. */
async function isOwner(db: UserScopedDb, workspaceId: string): Promise<boolean> {
  const { rows } = await db.query<{ role: string | null }>("select app.workspace_role($1) as role", [workspaceId]);
  return rows[0]?.role === "owner";
}

const nameTaken = (what: string) => new ProjectsError("name_taken", `A ${what} with that name already exists.`);

/** Returns the new status, or null when the user is not an owner of the workspace. */
export async function createStatus(db: UserScopedDb, workspaceId: string, input: StatusInput): Promise<ProjectStatus | null> {
  if (!(await isOwner(db, workspaceId))) return null;
  try {
    const { rows } = await db.query<StatusRow>(
      `insert into public.project_statuses (workspace_id, name, kind, color, position)
       select $1, $2, $3, $4, coalesce(max(position) + 1, 0) from public.project_statuses where workspace_id = $1
       returning id, name, kind, color, position`,
      [workspaceId, input.name, input.kind, input.color],
    );
    return rows[0] ?? null;
  } catch (error) {
    if (pgCode(error) === PG.UNIQUE_VIOLATION) throw nameTaken("status");
    throw error;
  }
}

export async function updateStatus(db: UserScopedDb, id: string, input: StatusInput): Promise<boolean> {
  try {
    const result = await db.query(
      "update public.project_statuses set name = $2, kind = $3, color = $4 where id = $1",
      [id, input.name, input.kind, input.color],
    );
    return result.rowCount === 1;
  } catch (error) {
    if (pgCode(error) === PG.UNIQUE_VIOLATION) throw nameTaken("status");
    throw error;
  }
}

/** A status in use, or the workspace's last one, cannot be deleted. */
export async function deleteStatus(db: UserScopedDb, id: string): Promise<boolean> {
  const found = await db.query<{ workspace_id: string }>("select workspace_id from public.project_statuses where id = $1", [id]);
  const workspaceId = found.rows[0]?.workspace_id;
  if (!workspaceId || !(await isOwner(db, workspaceId))) return false;

  const usage = await db.query<{ projects: number; statuses: number }>(
    `select (select count(*)::int from public.projects where status_id = $1) as projects,
            (select count(*)::int from public.project_statuses where workspace_id = $2) as statuses`,
    [id, workspaceId],
  );
  const { projects, statuses } = usage.rows[0]!;
  if (projects > 0) {
    throw new ProjectsError(
      "status_in_use",
      `${projects} ${projects === 1 ? "project uses" : "projects use"} this status. Move ${projects === 1 ? "it" : "them"} to another status first.`,
      { count: projects },
    );
  }
  if (statuses <= 1) throw new ProjectsError("last_status", "A workspace needs at least one status.");

  try {
    const result = await db.query("delete from public.project_statuses where id = $1", [id]);
    return result.rowCount === 1;
  } catch (error) {
    if (pgCode(error) === PG.FOREIGN_KEY_VIOLATION) {
      throw new ProjectsError("status_in_use", "Projects still use this status. Move them to another status first.");
    }
    throw error;
  }
}

/** Swaps a status with its neighbour and rewrites positions 0..n-1. Returns false when not allowed. */
export async function moveStatus(db: UserScopedDb, id: string, direction: "up" | "down"): Promise<boolean> {
  const found = await db.query<{ workspace_id: string }>("select workspace_id from public.project_statuses where id = $1", [id]);
  const workspaceId = found.rows[0]?.workspace_id;
  if (!workspaceId) return false;

  const ordered = (await listStatuses(db, workspaceId)).map((status) => status.id);
  const index = ordered.indexOf(id);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || target < 0 || target >= ordered.length) return true;
  [ordered[index], ordered[target]] = [ordered[target]!, ordered[index]!];

  const result = await db.query(
    `update public.project_statuses s set position = v.pos
     from (select id, (ord - 1)::int as pos from unnest($1::uuid[]) with ordinality as t(id, ord)) v
     where s.id = v.id and s.position <> v.pos`,
    [ordered],
  );
  // Zero or two rows change for a swap; if the policy blocked it, nothing does.
  return (result.rowCount ?? 0) > 0 || index === target;
}

export async function createCategory(db: UserScopedDb, workspaceId: string, input: CategoryInput): Promise<ProjectCategory | null> {
  if (!(await isOwner(db, workspaceId))) return null;
  try {
    const { rows } = await db.query<CategoryRow>(
      `insert into public.project_categories (workspace_id, name, color) values ($1, $2, $3)
       returning id, name, color`,
      [workspaceId, input.name, input.color],
    );
    return rows[0] ?? null;
  } catch (error) {
    if (pgCode(error) === PG.UNIQUE_VIOLATION) throw nameTaken("category");
    throw error;
  }
}

export async function updateCategory(db: UserScopedDb, id: string, input: CategoryInput): Promise<boolean> {
  try {
    const result = await db.query("update public.project_categories set name = $2, color = $3 where id = $1", [
      id,
      input.name,
      input.color,
    ]);
    return result.rowCount === 1;
  } catch (error) {
    if (pgCode(error) === PG.UNIQUE_VIOLATION) throw nameTaken("category");
    throw error;
  }
}

/** Projects in the category become uncategorised (foreign key `on delete set null`). */
export async function deleteCategory(db: UserScopedDb, id: string): Promise<boolean> {
  const result = await db.query("delete from public.project_categories where id = $1", [id]);
  return result.rowCount === 1;
}
