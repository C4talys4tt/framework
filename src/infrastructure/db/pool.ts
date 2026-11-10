import "server-only";
import { Pool } from "pg";
import { getEnv } from "@/infrastructure/env";

// Reuse one pool across hot reloads in development.
const globalForDb = globalThis as typeof globalThis & { __frameworkPool?: Pool };

/**
 * The single connection pool for the application.
 *
 * Only infrastructure code (the auth library and `withUser`) may query the pool
 * directly. Module data access must go through `withUser` so row-level
 * security applies.
 */
export function getPool(): Pool {
  if (!globalForDb.__frameworkPool) {
    const pool = new Pool({
      connectionString: getEnv().DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
    pool.on("error", (error) => {
      console.error("[db] idle client error", error);
    });
    globalForDb.__frameworkPool = pool;
  }
  return globalForDb.__frameworkPool;
}
