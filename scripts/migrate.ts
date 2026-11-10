// Applies pending SQL migrations. Usage: npm run db:migrate
import path from "node:path";
import { migrate } from "../src/infrastructure/db/migrator.ts";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
  process.exit(1);
}

const directory = path.resolve(import.meta.dirname, "../db/migrations");

try {
  const { applied, skipped } = await migrate(connectionString, directory);
  for (const name of applied) console.log(`applied  ${name}`);
  console.log(
    applied.length === 0
      ? `Database is up to date (${skipped.length} migration${skipped.length === 1 ? "" : "s"}).`
      : `Applied ${applied.length} migration${applied.length === 1 ? "" : "s"}.`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
