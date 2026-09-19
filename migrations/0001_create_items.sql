-- Sprint 2, Req 1: items table. Guarded with IF NOT EXISTS so this file is
-- safe to re-run (against a fresh database, or accidentally twice against
-- an existing one) rather than a one-shot statement that only works once.
--
-- price_cents is INTEGER, never a float/double — Req 2. Dollars-to-cents
-- conversion happens at the application boundary (lib/validation.ts), not
-- here; this column only ever stores the already-converted integer.
--
-- claim_token is generated in application code (lib/items.ts, via Node's
-- crypto.randomBytes) before the INSERT, not by a SQL default — Req 3
-- names crypto.randomUUID()/crypto.randomBytes specifically, and doing it
-- in SQL would mean relying on a Postgres extension (pgcrypto) instead.
-- UNIQUE because a claim_token is meant to identify exactly one item
-- (useful for sprint 3's lookup, and a cheap correctness check for free).
CREATE TABLE IF NOT EXISTS items (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  email TEXT NOT NULL,
  claimed BOOLEAN NOT NULL DEFAULT FALSE,
  claim_token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
