// Recreates the throwaway database the browser tests run against.
// Usage: npm run test:e2e (runs this first)
import path from "node:path";
import { Client } from "pg";
import { migrate } from "../src/infrastructure/db/migrator.ts";

const baseUrl = process.env.DATABASE_URL;
if (!baseUrl) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const target = new URL(baseUrl);
const name = `${target.pathname.slice(1)}_e2e`;
if (!/^[a-z0-9_]+$/.test(name)) {
  console.error(`Refusing to manage a database named "${name}".`);
  process.exit(1);
}
target.pathname = `/${name}`;

const admin = new Client({ connectionString: baseUrl });
await admin.connect();
await admin.query(`drop database if exists ${name} with (force)`);
await admin.query(`create database ${name}`);
await admin.end();

const { applied } = await migrate(target.toString(), path.resolve(import.meta.dirname, "../db/migrations"));
console.log(`Prepared ${name} (${applied.length} migrations).`);
