import type { UserScopedDb } from "@/infrastructure/db/user-scope";
import type { ActivityEntry, ActivityKind } from "../domain/activity";

type ActivityRow = {
  id: string;
  kind: ActivityKind;
  data: Record<string, unknown>;
  created_at: Date;
  actor_name: string | null;
};

export const ACTIVITY_PAGE_SIZE = 30;

/** Newest first. Pass the last id you have to get the next, older page. */
export async function listActivity(
  db: UserScopedDb,
  workspaceId: string,
  projectId: string,
  options: { before?: number | null; limit?: number } = {},
): Promise<{ entries: ActivityEntry[]; hasMore: boolean }> {
  const limit = options.limit ?? ACTIVITY_PAGE_SIZE;
  const { rows } = await db.query<ActivityRow>(
    `select a.id::text as id, a.kind, a.data, a.created_at, m.name as actor_name
     from public.project_activity a
     left join app.workspace_member_names($1) m on m.user_id = a.actor_id
     where a.project_id = $2 and a.workspace_id = $1 and ($3::bigint is null or a.id < $3::bigint)
     order by a.id desc
     limit $4`,
    [workspaceId, projectId, options.before ?? null, limit + 1],
  );
  const page = rows.slice(0, limit);
  return {
    entries: page.map((row) => ({
      id: Number(row.id),
      kind: row.kind,
      data: row.data,
      actorName: row.actor_name,
      createdAt: row.created_at.toISOString(),
    })),
    hasMore: rows.length > limit,
  };
}
