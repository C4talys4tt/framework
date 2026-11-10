import type { Pool, PoolClient } from "pg";

/** A database handle whose queries are restricted to one user by RLS. */
export type UserScopedDb = Pick<PoolClient, "query">;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Runs `fn` in a transaction that acts as `userId`.
 *
 * The transaction switches to the unprivileged `framework_app` role and sets
 * `app.user_id`, which every RLS policy reads through `app.current_user_id()`.
 * Both settings are transaction-local, so they can never leak to another
 * request through the pool (and they work behind transaction-mode poolers).
 */
export async function runAsUser<T>(
  pool: Pool,
  userId: string,
  fn: (db: UserScopedDb) => Promise<T>,
): Promise<T> {
  if (!UUID.test(userId)) {
    throw new Error("runAsUser requires a valid user id");
  }
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local role framework_app");
    await client.query("select set_config('app.user_id', $1, true)", [userId]);
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
