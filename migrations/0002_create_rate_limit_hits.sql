-- Sprint 5, Req 2: shared, cross-instance rate-limit state. One row per
-- (client, fixed window) pair, written by a single atomic
-- INSERT ... ON CONFLICT ... DO UPDATE in lib/rate-limit.ts. This table,
-- not any in-process variable, is what makes the limit hold across
-- serverless cold starts and concurrent instances — the reason this
-- sprint exists rather than being a ten-line middleware addition.
--
-- window_start is the aligned start of the fixed window a hit belongs to
-- (computed inside Postgres itself, from Postgres's own now(), by the
-- query in lib/rate-limit.ts), not a raw per-request timestamp — this is
-- what lets concurrent instances, each with their own clock, agree on
-- the same bucket for the same client without coordinating with each
-- other first.
--
-- IF NOT EXISTS, same as 0001: safe to re-run against a fresh database or
-- accidentally twice against an existing one.
CREATE TABLE IF NOT EXISTS rate_limit_hits (
  client_key TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (client_key, window_start)
);
