import { cp, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listMigrationFiles, migrate } from "../../src/infrastructure/db/migrator";
import { MIGRATIONS_DIR, createEmptyDatabase, type TestDatabase } from "./test-database";

/** A deterministic description of everything the migrations create. */
async function describeSchema(pool: Pool): Promise<unknown> {
  const columns = await pool.query(`
    select table_name, column_name, data_type, is_nullable, column_default
    from information_schema.columns
    where table_schema = 'public'
    order by table_name, ordinal_position
  `);
  const policies = await pool.query(`
    select tablename, policyname, cmd, roles::text, qual, with_check
    from pg_policies where schemaname = 'public' order by tablename, policyname
  `);
  const rls = await pool.query(`
    select relname, relrowsecurity from pg_class
    where relnamespace = 'public'::regnamespace and relkind = 'r' order by relname
  `);
  const functions = await pool.query(`
    select p.proname, pg_get_function_identity_arguments(p.oid) as args, p.prosecdef, p.proconfig::text
    from pg_proc p where p.pronamespace = 'app'::regnamespace order by 1, 2
  `);
  const grants = await pool.query(`
    select table_name, privilege_type from information_schema.role_table_grants
    where grantee = 'framework_app' order by 1, 2
  `);
  return {
    columns: columns.rows,
    policies: policies.rows,
    rls: rls.rows,
    functions: functions.rows,
    grants: grants.rows,
  };
}

describe("migrations", () => {
  let first: TestDatabase;
  let second: TestDatabase;
  const temporaryDirectories: string[] = [];

  beforeAll(async () => {
    [first, second] = await Promise.all([createEmptyDatabase(), createEmptyDatabase()]);
  });

  afterAll(async () => {
    await Promise.all([first?.drop(), second?.drop()]);
    await Promise.all(temporaryDirectories.map((directory) => rm(directory, { recursive: true, force: true })));
  });

  async function copyMigrations(): Promise<string> {
    const directory = await mkdtemp(path.join(tmpdir(), "framework-migrations-"));
    temporaryDirectories.push(directory);
    await cp(MIGRATIONS_DIR, directory, { recursive: true });
    return directory;
  }

  it("applies every migration to an empty database", async () => {
    const files = await readdir(MIGRATIONS_DIR);
    const result = await migrate(first.url, MIGRATIONS_DIR);
    expect(result.applied).toEqual(files.filter((name) => name.endsWith(".sql")).sort());
    expect(result.skipped).toEqual([]);
  });

  it("is a no-op when run again", async () => {
    const result = await migrate(first.url, MIGRATIONS_DIR);
    expect(result.applied).toEqual([]);
    expect(result.skipped.length).toBeGreaterThan(0);
  });

  it("produces an identical schema in a second database", async () => {
    await migrate(second.url, MIGRATIONS_DIR);
    expect(await describeSchema(second.pool)).toEqual(await describeSchema(first.pool));
  });

  it("enables row-level security on every table it creates", async () => {
    const { rows } = await first.pool.query<{ relname: string; relrowsecurity: boolean }>(`
      select relname, relrowsecurity from pg_class
      where relnamespace = 'public'::regnamespace and relkind = 'r' and relname <> 'schema_migrations'
    `);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.filter((row) => !row.relrowsecurity)).toEqual([]);
  });

  it("refuses to run when an applied migration has been edited", async () => {
    const directory = await copyMigrations();
    const [name] = await listMigrationFiles(directory);
    const file = path.join(directory, name!);
    await writeFile(file, `${await readFile(file, "utf8")}\n-- edited after release\n`);
    await expect(migrate(first.url, directory)).rejects.toThrow(/modified after it was applied/);
  });

  it("refuses to run when the database is ahead of the files on disk", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "framework-migrations-"));
    temporaryDirectories.push(directory);
    await expect(migrate(first.url, directory)).rejects.toThrow(/missing from disk/);
  });

  it("rolls a failing migration back completely", async () => {
    const directory = await copyMigrations();
    await writeFile(
      path.join(directory, "9999_broken.sql"),
      "create table public.half_done (id int); select * from public.table_that_does_not_exist;",
    );
    await expect(migrate(first.url, directory)).rejects.toThrow(/9999_broken\.sql failed/);
    const { rows } = await first.pool.query("select to_regclass('public.half_done') as table_name");
    expect(rows[0].table_name).toBeNull();
    const applied = await first.pool.query("select 1 from public.schema_migrations where name = '9999_broken.sql'");
    expect(applied.rowCount).toBe(0);
  });

  it("rejects badly named migration files", async () => {
    const directory = await copyMigrations();
    await writeFile(path.join(directory, "add-things.sql"), "select 1;");
    await expect(listMigrationFiles(directory)).rejects.toThrow(/0001_description\.sql/);
  });
});
