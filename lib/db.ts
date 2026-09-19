import { Pool, type QueryResult, type QueryResultRow } from "pg";

// Connection-string based on purpose: this app does not name a specific
// Postgres product or client SDK, so it works the same way whether the
// deployed database comes from Vercel's own Postgres storage integration,
// a Neon project connected through Vercel's marketplace, or any other
// Postgres reachable over a standard connection string. Both env var names
// are accepted because Vercel's first-party storage integrations have used
// different names across product iterations (see sprint 1's flagged
// assumption in the sprint file); DATABASE_URL wins if both are set.
const connectionString = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;

// Reused across invocations within the same server process/lambda instance.
// Never constructed at import time with data that must be fresh per
// request (see lib/db.ts vs. route.ts split: the pool is a connection
// client, not a query result, so caching it at module scope is safe and
// does not violate the "no static/cached response" requirement on the
// health route, which is about the *response*, not the client object).
let pool: Pool | undefined;

function getPool(): Pool {
  if (!connectionString) {
    throw new Error(
      "No database connection string configured. Set DATABASE_URL (or POSTGRES_URL) in the environment."
    );
  }
  if (!pool) {
    pool = new Pool({ connectionString });
  }
  return pool;
}

/**
 * Runs a parameterized query against Postgres. Throws on any failure
 * (unreachable host, auth failure, syntax error, etc.) rather than
 * swallowing it — callers decide how to translate that into a response.
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  return getPool().query<T>(text, params);
}
