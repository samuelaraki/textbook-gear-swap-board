#!/usr/bin/env node
// Sprint 2, Req 1: applies every migrations/*.sql file, in filename order,
// against DATABASE_URL (or POSTGRES_URL). This is the "committed,
// re-runnable migration" mechanism the requirement asks for — a checked-in,
// reviewable file plus a script that runs it, never a hand-run statement
// typed into a dashboard that leaves no record. Each migration file is
// itself written to be idempotent (IF NOT EXISTS), so running this twice
// against the same database is safe.
//
// Deliberately a small standalone script over a migration-tracking
// library: there is exactly one migration so far, and `pg` is already a
// project dependency — no new dependency needed to satisfy this
// requirement literally.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const connectionString = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
if (!connectionString) {
  console.error(
    "Set DATABASE_URL (or POSTGRES_URL) before running migrations."
  );
  process.exit(1);
}

const files = readdirSync(__dirname)
  .filter((file) => file.endsWith(".sql"))
  .sort();

if (files.length === 0) {
  console.log("No migration files found.");
  process.exit(0);
}

const client = new Client({ connectionString });

async function main() {
  await client.connect();
  try {
    for (const file of files) {
      const sql = readFileSync(path.join(__dirname, file), "utf8");
      console.log(`Applying ${file}...`);
      await client.query(sql);
    }
    console.log(`Applied ${files.length} migration(s) successfully.`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
