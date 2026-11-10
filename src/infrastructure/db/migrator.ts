import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";

/**
 * Forward-only SQL migration runner.
 *
 * - Files in the migrations directory are applied in filename order.
 * - Each file runs in its own transaction and is recorded with a checksum.
 * - An applied file whose contents later change is treated as an error, so the
 *   schema in every environment is the product of the same SQL.
 * - A session advisory lock serialises concurrent runs.
 *
 * This file has no application imports so it can run under plain Node
 * (`node scripts/migrate.ts`) as well as from tests.
 */

const FILE_PATTERN = /^\d{4}_[a-z0-9_]+\.sql$/;
const LOCK_KEY = 7_203_114_901;

export type MigrationResult = { applied: string[]; skipped: string[] };

export async function listMigrationFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory);
  const sqlFiles = entries.filter((name) => name.endsWith(".sql")).sort();
  const invalid = sqlFiles.filter((name) => !FILE_PATTERN.test(name));
  if (invalid.length > 0) {
    throw new Error(`Migration filenames must look like 0001_description.sql: ${invalid.join(", ")}`);
  }
  return sqlFiles;
}

export function checksum(sql: string): string {
  return createHash("sha256").update(sql.replace(/\r\n/g, "\n")).digest("hex");
}

export async function migrate(connectionString: string, directory: string): Promise<MigrationResult> {
  const files = await listMigrationFiles(directory);
  const client = new Client({ connectionString });
  await client.connect();
  const result: MigrationResult = { applied: [], skipped: [] };
  try {
    await client.query("select pg_advisory_lock($1)", [LOCK_KEY]);
    await client.query(`
      create table if not exists public.schema_migrations (
        name text primary key,
        checksum text not null,
        applied_at timestamptz not null default now()
      )
    `);
    const { rows } = await client.query<{ name: string; checksum: string }>(
      "select name, checksum from public.schema_migrations",
    );
    const appliedChecksums = new Map(rows.map((row) => [row.name, row.checksum]));

    const missing = [...appliedChecksums.keys()].filter((name) => !files.includes(name));
    if (missing.length > 0) {
      throw new Error(`Database has migrations that are missing from disk: ${missing.join(", ")}`);
    }

    for (const name of files) {
      const sql = await readFile(path.join(directory, name), "utf8");
      const sum = checksum(sql);
      const existing = appliedChecksums.get(name);
      if (existing !== undefined) {
        if (existing !== sum) {
          throw new Error(
            `Migration ${name} was modified after it was applied. Add a new migration instead of editing it.`,
          );
        }
        result.skipped.push(name);
        continue;
      }
      try {
        await client.query("begin");
        await client.query(sql);
        await client.query("insert into public.schema_migrations (name, checksum) values ($1, $2)", [name, sum]);
        await client.query("commit");
      } catch (error) {
        await client.query("rollback").catch(() => undefined);
        throw new Error(`Migration ${name} failed: ${error instanceof Error ? error.message : String(error)}`, {
          cause: error,
        });
      }
      result.applied.push(name);
    }
    return result;
  } finally {
    await client.query("select pg_advisory_unlock($1)", [LOCK_KEY]).catch(() => undefined);
    await client.end();
  }
}
