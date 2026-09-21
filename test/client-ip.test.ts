import { test } from "node:test";
import assert from "node:assert/strict";
import type { NextRequest } from "next/server";
import { getClientIp } from "../lib/client-ip.ts";

// getClientIp only ever reads request.headers.get(...) — NextRequest's
// headers is a standard web Headers object, so a plain object exposing
// exactly that (built from the real, global Headers class) exercises the
// same code path without depending on Next's own module resolution.
function requestWithHeaders(headers: Record<string, string>): NextRequest {
  return { headers: new Headers(headers) } as unknown as NextRequest;
}

test("QA1's round-1 demonstration, now fixed: one client varying x-forwarded-for cannot obtain a fresh bucket when a more-trusted header is present and stable", () => {
  const stable = "x-real-ip"; // stands in for whatever Vercel actually sets
  const results = ["9.9.9.9", "8.8.8.8", "1.1.1.1"].map((spoofed) =>
    getClientIp(
      requestWithHeaders({
        "x-forwarded-for": spoofed,
        [stable]: "203.0.113.9",
      })
    )
  );
  assert.deepEqual(results, ["203.0.113.9", "203.0.113.9", "203.0.113.9"]);
});

test("preference order: x-vercel-forwarded-for wins over x-real-ip and x-forwarded-for when all three are present", () => {
  const req = requestWithHeaders({
    "x-vercel-forwarded-for": "203.0.113.1",
    "x-real-ip": "203.0.113.2",
    "x-forwarded-for": "203.0.113.3",
  });
  assert.equal(getClientIp(req), "203.0.113.1");
});

test("preference order: x-real-ip wins over x-forwarded-for when x-vercel-forwarded-for is absent", () => {
  const req = requestWithHeaders({
    "x-real-ip": "203.0.113.2",
    "x-forwarded-for": "203.0.113.3",
  });
  assert.equal(getClientIp(req), "203.0.113.2");
});

test("x-forwarded-for is used only when nothing more trusted is present", () => {
  const req = requestWithHeaders({ "x-forwarded-for": "203.0.113.5" });
  assert.equal(getClientIp(req), "203.0.113.5");
});

test("never the leftmost entry: a multi-hop x-forwarded-for resolves to the LAST entry, not the first", () => {
  const req = requestWithHeaders({
    "x-forwarded-for": "203.0.113.5, 70.41.3.18, 150.172.238.178",
  });
  assert.equal(getClientIp(req), "150.172.238.178");
});

test("never the leftmost entry applies to x-vercel-forwarded-for too (documented as format-identical to x-forwarded-for)", () => {
  const req = requestWithHeaders({
    "x-vercel-forwarded-for": "203.0.113.5, 150.172.238.178",
  });
  assert.equal(getClientIp(req), "150.172.238.178");
});

test("whitespace around entries is trimmed", () => {
  const req = requestWithHeaders({ "x-forwarded-for": "  203.0.113.5  ,  70.41.3.18  " });
  assert.equal(getClientIp(req), "70.41.3.18");
});

test("a trailing comma / empty last segment falls back to the last non-empty entry, not an empty string", () => {
  const req = requestWithHeaders({ "x-forwarded-for": "203.0.113.5, 70.41.3.18, " });
  assert.equal(getClientIp(req), "70.41.3.18");
});

test("x-forwarded-for present but empty falls back to the next header in preference order", () => {
  const req = requestWithHeaders({
    "x-forwarded-for": "",
    "x-real-ip": "198.51.100.7",
  });
  assert.equal(getClientIp(req), "198.51.100.7");
});

test("x-forwarded-for present but only commas/whitespace falls back to the next header", () => {
  const req = requestWithHeaders({
    "x-forwarded-for": " , ",
    "x-real-ip": "198.51.100.7",
  });
  assert.equal(getClientIp(req), "198.51.100.7");
});

test("no relevant headers at all — returns null, not a crash or a fake value", () => {
  const req = requestWithHeaders({});
  assert.equal(getClientIp(req), null);
});
