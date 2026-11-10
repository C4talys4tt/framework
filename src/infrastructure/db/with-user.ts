import "server-only";
import { getPool } from "./pool";
import { runAsUser, type UserScopedDb } from "./user-scope";

export type { UserScopedDb };

/** The only way application modules reach the database. See `runAsUser`. */
export function withUser<T>(userId: string, fn: (db: UserScopedDb) => Promise<T>): Promise<T> {
  return runAsUser(getPool(), userId, fn);
}
