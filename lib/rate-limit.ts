import { query } from "./db";
import { computeRetryAfterSeconds } from "./rate-limit-window";

// Sprint 5, Req 1: explicit, named policy — chosen, not left to a library
// default. "A handful of posts per client per hour" from the sprint file
// becomes 5 requests / 60 minutes here: enough headroom for someone
// posting several textbooks in one sitting (Req 4) — three well within
// five, with room to spare — while still meaningfully bounding a script
// that would otherwise post as fast as the network allows. See the
// sprint handoff for how this was checked against a live deployment.
export const RATE_LIMIT_MAX_REQUESTS = 5;
export const RATE_LIMIT_WINDOW_SECONDS = 60 * 60; // 1 hour

export interface RateLimitResult {
  allowed: boolean;
  /** Always a positive integer, safe to send directly as Retry-After. */
  retryAfterSeconds: number;
}

interface RateLimitHitRow {
  count: number;
  window_start: Date;
}

// LiveQA round 1 (FAIL): migrations/0002 was committed but nothing on
// this project's deploy path ever ran it, so rate_limit_hits never
// existed in production. Req 6's own fail-open path swallowed the
// resulting error on every single request — nine posts in a row
// succeeded, silently, with no 429 and no visible sign anything was
// wrong. The fix is not "remember to run the migration" (that's the
// exact human step that was already missed once); it's making the
// schema's own existence not depend on anyone remembering anything.
//
// This is deliberately NOT wired into the build (e.g. a "prebuild" npm
// script) — this project's fail-open live tests (this sprint's Req 6,
// sprint 4's Req 8) work by pointing DATABASE_URL/POSTGRES_URL at an
// unreachable host on a preview deploy. A build-time migration step
// would make that preview fail to build at all, taking away the exact
// environment LiveQA needs to test the fail-open path against — trading
// one real gap for a worse one. Ensuring the schema at runtime, lazily,
// on first use, fixes the actual defect (a missing table silently
// disabling the limiter forever) without disturbing that technique: a
// poisoned DATABASE_URL just makes this throw like every other query
// here, which is already exactly what Req 6's fail-open path is for.
//
// Memoized per warm instance so a steady-state instance pays for this
// once, not on every request — but reset to null on failure, so a
// transient outage doesn't wedge a warm instance into believing the
// schema is ready when it never actually confirmed that.
let schemaReadyPromise: Promise<void> | null = null;

function ensureSchema(): Promise<void> {
  if (!schemaReadyPromise) {
    schemaReadyPromise = query(
      `CREATE TABLE IF NOT EXISTS rate_limit_hits (
         client_key TEXT NOT NULL,
         window_start TIMESTAMPTZ NOT NULL,
         count INTEGER NOT NULL DEFAULT 1,
         PRIMARY KEY (client_key, window_start)
       )`
    )
      .then(() => undefined)
      .catch((error) => {
        schemaReadyPromise = null;
        throw error;
      });
  }
  return schemaReadyPromise;
}

// Sprint 5, Req 2: **the central requirement of this sprint.** State
// lives in Postgres — one row per (client, fixed window) — not in any
// process-local variable. Every serverless instance reads and writes the
// same table via the same query below, so the limit holds across cold
// starts and concurrent instances, which is the entire reason this is a
// real sprint rather than a ten-line middleware addition using a
// module-scope Map. Do not add a module-scope Map/Set/array/counter as a
// cache "in front of" this — a cache instead of the shared store, rather
// than in front of one, is exactly the defect this file exists to avoid,
// and this module intentionally has no such structure anywhere in it.
//
// The window boundary is computed inside Postgres itself
// (floor(epoch/window)*window, via to_timestamp), not in application
// code — every instance calling this, regardless of its own clock,
// converges on the same window_start for the same client because
// Postgres's now() is the single shared source of truth, not each
// instance's own clock.
//
// The INSERT ... ON CONFLICT ... DO UPDATE is one atomic statement, so
// two concurrent requests from the same client in the same window cannot
// race each other into a lost update the way a separate read-then-write
// would.
//
// Known, accepted limitation: this is a fixed window, not a sliding one.
// A client could in principle post up to RATE_LIMIT_MAX_REQUESTS just
// before a window boundary and again just after, briefly doubling the
// effective rate at that instant. That's an acceptable trade for a
// single-query implementation given Req 7's own framing — this is meant
// to blunt casual/scripted junk, not to be an airtight limiter — and is
// recorded here rather than being an unstated gap.
export async function checkRateLimit(clientKey: string): Promise<RateLimitResult> {
  const windowSeconds = RATE_LIMIT_WINDOW_SECONDS;

  // Throws exactly like the query below on a genuinely unreachable store
  // — same error shape, same caller-side fail-open handling in
  // app/api/items/route.ts. On any database that already has the table
  // (every case after the very first successful call on a given
  // instance), this resolves an already-settled promise and costs
  // nothing extra.
  await ensureSchema();

  const result = await query<RateLimitHitRow>(
    `INSERT INTO rate_limit_hits (client_key, window_start, count)
     VALUES (
       $1,
       to_timestamp(floor(extract(epoch FROM now()) / $2) * $2),
       1
     )
     ON CONFLICT (client_key, window_start)
     DO UPDATE SET count = rate_limit_hits.count + 1
     RETURNING count, window_start`,
    [clientKey, windowSeconds]
  );

  const row = result.rows[0];
  const retryAfterSeconds = computeRetryAfterSeconds(
    row.window_start.getTime(),
    windowSeconds,
    Date.now()
  );

  // Opportunistic, off-critical-path cleanup so the table doesn't grow
  // without bound. Low probability so it doesn't add a second query to
  // most requests; correctness of the limit itself never depends on this
  // running promptly (or at all) — a stale row just means one extra,
  // otherwise-inert record sitting in an expired window.
  if (Math.random() < 0.01) {
    void cleanupExpiredWindows().catch((error) => {
      console.error("[lib/rate-limit] cleanup failed:", error);
    });
  }

  return {
    allowed: row.count <= RATE_LIMIT_MAX_REQUESTS,
    retryAfterSeconds,
  };
}

async function cleanupExpiredWindows(): Promise<void> {
  // Comfortably past any window still relevant to a live check, so this
  // can never delete a row a concurrent request still needs.
  await query(
    `DELETE FROM rate_limit_hits WHERE window_start < now() - interval '2 hours'`
  );
}
