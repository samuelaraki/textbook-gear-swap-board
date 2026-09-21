import { test } from "node:test";
import assert from "node:assert/strict";
import type { NextRequest } from "next/server";
import { getClientIp } from "../lib/client-ip.ts";

// getClientIp only ever reads request.headers.get(...) — NextRequest's
// headers is a standard web Headers object, so a plain object exposing
// exactly that (built from the real, global Headers class) exercises the
// same code path without depending on Next's own module resolution
// (importing the concrete NextRequest class outside Next's own bundler
// runtime hits its package export map in ways plain Node ESM doesn't
// resolve the same way). This is only a type-level stand-in — the type
// import above is erased at runtime and used solely so this file stays
// honest about the real parameter type.
function requestWithHeaders(headers: Record<string, string>): NextRequest {
  return { headers: new Headers(headers) } as unknown as NextRequest;
}

test("single IP in x-forwarded-for", () => {
  const req = requestWithHeaders({ "x-forwarded-for": "203.0.113.5" });
  assert.equal(getClientIp(req), "203.0.113.5");
});

test("first entry of a multi-hop x-forwarded-for is used, later hops ignored", () => {
  const req = requestWithHeaders({
    "x-forwarded-for": "203.0.113.5, 70.41.3.18, 150.172.238.178",
  });
  assert.equal(getClientIp(req), "203.0.113.5");
});

test("whitespace around entries is trimmed", () => {
  const req = requestWithHeaders({ "x-forwarded-for": "  203.0.113.5  ,70.41.3.18" });
  assert.equal(getClientIp(req), "203.0.113.5");
});

test("falls back to x-real-ip when x-forwarded-for is absent", () => {
  const req = requestWithHeaders({ "x-real-ip": "198.51.100.7" });
  assert.equal(getClientIp(req), "198.51.100.7");
});

test("x-forwarded-for present but empty string falls back to x-real-ip", () => {
  const req = requestWithHeaders({
    "x-forwarded-for": "",
    "x-real-ip": "198.51.100.7",
  });
  assert.equal(getClientIp(req), "198.51.100.7");
});

test("x-forwarded-for present but only commas/whitespace falls back to x-real-ip", () => {
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
