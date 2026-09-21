// Sprint 5, Req 5: the honeypot field name and detection logic, shared by
// the form (components/board.tsx) and the route handler
// (app/api/items/route.ts) from this one place so the two can't drift on
// what field name is being watched.
//
// Named to look like something a naive bot's generic form-filler would
// target — "company" is a common autofill/bait field — not "honeypot"
// itself. The field's name being unremarkable is not what hides it from
// a human (that's the off-screen/aria-hidden styling in board.tsx); it
// just avoids advertising its purpose to anything inspecting field names.
export const HONEYPOT_FIELD_NAME = "company";

// Req 5: "submitted empty by real browsers, filled by naive bots." Any
// non-whitespace value counts as filled — a real user never sees or
// focuses this field, so there is no legitimate case where it arrives
// non-empty.
export function isHoneypotTriggered(body: Record<string, unknown>): boolean {
  const value = body[HONEYPOT_FIELD_NAME];
  return typeof value === "string" && value.trim().length > 0;
}
