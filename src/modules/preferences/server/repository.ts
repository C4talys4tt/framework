import type { UserScopedDb } from "@/infrastructure/db/user-scope";
import { DEFAULT_PREFERENCES, type Preferences } from "../domain/appearance";

type Row = {
  theme: Preferences["theme"];
  density: Preferences["density"];
  reduce_motion: boolean;
  sidebar_collapsed: boolean;
};

/** RLS limits this to the acting user's own row. */
export async function getPreferences(db: UserScopedDb): Promise<Preferences> {
  const { rows } = await db.query<Row>(
    "select theme, density, reduce_motion, sidebar_collapsed from public.user_preferences",
  );
  const row = rows[0];
  if (!row) return DEFAULT_PREFERENCES;
  return {
    theme: row.theme,
    density: row.density,
    reduceMotion: row.reduce_motion,
    sidebarCollapsed: row.sidebar_collapsed,
  };
}

export async function savePreferences(db: UserScopedDb, userId: string, patch: Partial<Preferences>): Promise<void> {
  const next = { ...(await getPreferences(db)), ...patch };
  await db.query(
    `
    insert into public.user_preferences (user_id, theme, density, reduce_motion, sidebar_collapsed)
    values ($1, $2, $3, $4, $5)
    on conflict (user_id) do update
      set theme = excluded.theme,
          density = excluded.density,
          reduce_motion = excluded.reduce_motion,
          sidebar_collapsed = excluded.sidebar_collapsed
    `,
    [userId, next.theme, next.density, next.reduceMotion, next.sidebarCollapsed],
  );
}
