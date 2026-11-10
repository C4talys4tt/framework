import type { UserScopedDb } from "@/infrastructure/db/user-scope";
import { createSlug, type WorkspaceDetail, type WorkspaceRole, type WorkspaceSummary } from "../domain/workspace";

// Every query here runs under RLS as the acting user (see runAsUser), so a
// workspace the user is not a member of simply does not exist.

type SummaryRow = { id: string; name: string; slug: string; role: WorkspaceRole };
type DetailRow = SummaryRow & { member_count: number; created_at: Date };

const UNIQUE_VIOLATION = "23505";

export async function listWorkspaces(db: UserScopedDb): Promise<WorkspaceSummary[]> {
  const { rows } = await db.query<SummaryRow>(`
    select w.id, w.name, w.slug, app.workspace_role(w.id) as role
    from public.workspaces w
    order by w.created_at, w.id
  `);
  return rows;
}

export async function findWorkspaceBySlug(db: UserScopedDb, slug: string): Promise<WorkspaceDetail | null> {
  const { rows } = await db.query<DetailRow>(
    `
    select w.id, w.name, w.slug, w.created_at,
           app.workspace_role(w.id) as role,
           (select count(*)::int from public.workspace_members m where m.workspace_id = w.id) as member_count
    from public.workspaces w
    where w.slug = $1
    `,
    [slug],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    role: row.role,
    memberCount: row.member_count,
    createdAt: row.created_at,
  };
}

export async function createWorkspace(db: UserScopedDb, name: string): Promise<WorkspaceSummary> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await db.query("savepoint create_workspace");
    try {
      const { rows } = await db.query<{ id: string; name: string; slug: string }>(
        "select id, name, slug from app.create_workspace($1, $2)",
        [name, createSlug(name)],
      );
      const row = rows[0]!;
      return { ...row, role: "owner" };
    } catch (error) {
      if ((error as { code?: string }).code !== UNIQUE_VIOLATION) throw error;
      await db.query("rollback to savepoint create_workspace");
    }
  }
  throw new Error("Could not allocate a unique workspace slug");
}

/** Returns false when the workspace is not visible to the user or they are not its owner. */
export async function renameWorkspace(db: UserScopedDb, workspaceId: string, name: string): Promise<boolean> {
  const result = await db.query("update public.workspaces set name = $2 where id = $1", [workspaceId, name]);
  return result.rowCount === 1;
}

/**
 * Makes sure the user has at least one workspace and returns their workspaces.
 * A per-user advisory lock keeps two concurrent first requests from creating
 * two personal workspaces.
 */
export async function ensurePersonalWorkspace(
  db: UserScopedDb,
  userId: string,
  defaultName: string,
): Promise<WorkspaceSummary[]> {
  const existing = await listWorkspaces(db);
  if (existing.length > 0) return existing;
  await db.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [`personal-workspace:${userId}`]);
  const afterLock = await listWorkspaces(db);
  if (afterLock.length > 0) return afterLock;
  return [await createWorkspace(db, defaultName)];
}
