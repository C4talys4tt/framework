import { randomBytes } from "node:crypto";
import path from "node:path";
import { Client, Pool } from "pg";
import { migrate } from "../../src/infrastructure/db/migrator";

export const MIGRATIONS_DIR = path.resolve(import.meta.dirname, "../../db/migrations");

function adminUrl(): string {
  const url = process.env.DATABASE_URL ?? "postgres://framework:framework@127.0.0.1:5432/framework_dev";
  return url;
}

export type TestDatabase = {
  url: string;
  pool: Pool;
  drop: () => Promise<void>;
};

/**
 * Creates an empty, uniquely named database on the server that DATABASE_URL
 * points at. The role in DATABASE_URL needs CREATEDB.
 */
export async function createEmptyDatabase(): Promise<TestDatabase> {
  const name = `framework_test_${randomBytes(6).toString("hex")}`;
  const admin = new Client({ connectionString: adminUrl() });
  await admin.connect();
  await admin.query(`create database ${name}`);
  await admin.end();

  const target = new URL(adminUrl());
  target.pathname = `/${name}`;
  const url = target.toString();
  const pool = new Pool({ connectionString: url, max: 4 });

  return {
    url,
    pool,
    drop: async () => {
      await pool.end();
      const cleanup = new Client({ connectionString: adminUrl() });
      await cleanup.connect();
      await cleanup.query(`drop database if exists ${name} with (force)`);
      await cleanup.end();
    },
  };
}

export async function createMigratedDatabase(): Promise<TestDatabase> {
  const database = await createEmptyDatabase();
  await migrate(database.url, MIGRATIONS_DIR);
  return database;
}

/** Inserts a user the way the auth library would, bypassing sign-up. */
export async function insertUser(pool: Pool, name: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    "insert into public.auth_users (name, email) values ($1, $2) returning id",
    [name, `${name.toLowerCase().replace(/\W+/g, ".")}.${randomBytes(4).toString("hex")}@example.com`],
  );
  return rows[0]!.id;
}
