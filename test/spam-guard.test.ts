import { test } from "node:test";
import assert from "node:assert/strict";
import { HONEYPOT_FIELD_NAME, isHoneypotTriggered } from "../lib/spam-guard.ts";

test("real browsers submit the honeypot empty — not triggered", () => {
  assert.equal(isHoneypotTriggered({ [HONEYPOT_FIELD_NAME]: "" }), false);
});

test("field entirely absent from the body — not triggered", () => {
  assert.equal(isHoneypotTriggered({}), false);
});

test("whitespace-only value — not triggered (a real user never types into it)", () => {
  assert.equal(isHoneypotTriggered({ [HONEYPOT_FIELD_NAME]: "   \t\n " }), false);
});

test("any real value — triggered", () => {
  assert.equal(isHoneypotTriggered({ [HONEYPOT_FIELD_NAME]: "http://spam.example" }), true);
});

test("non-string value (e.g. a bot sending a number or array) — not triggered, not a crash", () => {
  assert.equal(isHoneypotTriggered({ [HONEYPOT_FIELD_NAME]: 12345 }), false);
  assert.equal(isHoneypotTriggered({ [HONEYPOT_FIELD_NAME]: null }), false);
  assert.equal(isHoneypotTriggered({ [HONEYPOT_FIELD_NAME]: ["x"] }), false);
});

test("other fields being filled normally doesn't trip it", () => {
  assert.equal(
    isHoneypotTriggered({ title: "Calculus textbook", price: "20", email: "a@b.com" }),
    false
  );
});
