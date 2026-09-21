// Pulled into its own leaf module (no imports of its own) so it can be
// unit-tested directly (test/rate-limit-window.test.ts) with no database
// and no dependency on lib/db.ts. checkRateLimit's Postgres round trip is
// the part that actually needs a real database to mean anything — that's
// covered by this sprint's LiveQA criteria instead, against the real
// deployment.
export function computeRetryAfterSeconds(
  windowStartMs: number,
  windowSeconds: number,
  nowMs: number
): number {
  const windowEndMs = windowStartMs + windowSeconds * 1000;
  // Never 0 or negative: a Retry-After of 0 (possible right at the
  // boundary, where windowEndMs - nowMs rounds to 0) would tell a client
  // to retry immediately, which is a lie the instant it's sent — the
  // window it's retrying into may already be full. Math.max floors it to
  // at least 1 full second.
  return Math.max(1, Math.ceil((windowEndMs - nowMs) / 1000));
}
