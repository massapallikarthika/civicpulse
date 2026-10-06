import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;
const connectionString = process.env.SUPABASE_DB_URL;

if (!connectionString) {
  throw new Error("SUPABASE_DB_URL is required to apply CivicPulse migrations.");
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.resolve(
  scriptDir,
  "../../../supabase/migrations/202610060001_civicpulse_core.sql",
);
const migrationSql = await readFile(migrationPath, "utf8");
const migrationId = path.basename(migrationPath, ".sql");
const client = new Client({ connectionString, connectionTimeoutMillis: 15000 });

try {
  await client.connect();
  await client.query(`
    create table if not exists public.civicpulse_migrations (
      id text primary key,
      applied_at timestamptz not null default now()
    )
  `);
  const prior = await client.query(
    "select id from public.civicpulse_migrations where id = $1",
    [migrationId],
  );

  if (prior.rowCount === 0) {
    await client.query("begin");
    try {
      await client.query(migrationSql);
      await client.query(
        "insert into public.civicpulse_migrations (id) values ($1)",
        [migrationId],
      );
      await client.query("commit");
      process.stdout.write(`Applied ${migrationId}.\n`);
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  } else {
    process.stdout.write(`${migrationId} is already applied.\n`);
  }
} catch (error) {
  const code =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : "unknown";
  process.stderr.write(`CivicPulse migration failed (database error ${code}).\n`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
