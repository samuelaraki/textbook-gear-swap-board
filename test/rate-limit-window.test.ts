import { test } from "node:test";
import assert from "node:assert/strict";
import { computeRetryAfterSeconds } from "../lib/rate-limit-window.ts";

const WINDOW_SECONDS = 3600; // matches RATE_LIMIT_WINDOW_SECONDS, kept
// literal here rather than imported so this test still catches a change
// to the exported constant's value being silently wrong relative to the
// window math, instead of moving in lockstep with it.

test("just after a window starts — retry-after is close to the full window", () => {
  const windowStartMs = 1_000_000_000_000;
  const nowMs = windowStartMs + 1_000; // 1s into the window
  const result = computeRetryAfterSeconds(windowStartMs, WINDOW_SECONDS, nowMs);
  assert.equal(result, WINDOW_SECONDS - 1);
});

test("just before a window ends — retry-after rounds up to at least 1, never 0", () => {
  const windowStartMs = 1_000_000_000_000;
  const nowMs = windowStartMs + WINDOW_SECONDS * 1000 - 1; // 1ms left
  const result = computeRetryAfterSeconds(windowStartMs, WINDOW_SECONDS, nowMs);
  assert.equal(result, 1);
});

test("exactly at the window boundary — still at least 1, never 0 or negative", () => {
  const windowStartMs = 1_000_000_000_000;
  const nowMs = windowStartMs + WINDOW_SECONDS * 1000; // exactly the end
  const result = computeRetryAfterSeconds(windowStartMs, WINDOW_SECONDS, nowMs);
  assert.ok(result >= 1, `expected >= 1, got ${result}`);
});

test("clock skew past the window end (e.g. DB and app instant differ slightly) — clamped to 1, not negative", () => {
  const windowStartMs = 1_000_000_000_000;
  const nowMs = windowStartMs + WINDOW_SECONDS * 1000 + 5_000; // 5s past the end
  const result = computeRetryAfterSeconds(windowStartMs, WINDOW_SECONDS, nowMs);
  assert.equal(result, 1);
});

test("halfway through the window — retry-after is roughly half the window", () => {
  const windowStartMs = 1_000_000_000_000;
  const nowMs = windowStartMs + (WINDOW_SECONDS * 1000) / 2;
  const result = computeRetryAfterSeconds(windowStartMs, WINDOW_SECONDS, nowMs);
  assert.equal(result, WINDOW_SECONDS / 2);
});
