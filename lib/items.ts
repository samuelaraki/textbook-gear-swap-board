import { randomBytes } from "node:crypto";
import { query } from "./db";
import type { ValidatedItemInput } from "./validation";

// Sprint 2, Req 4: claim_token never leaves the database in this sprint,
// no exceptions. Item is the *only* shape this module ever returns, and it
// has no claim_token field at all — not "claim_token omitted by the
// caller," but "claim_token cannot be returned because this type has
// nowhere to put it." Every query below selects columns explicitly for
// the same reason: a SELECT * on a path that reaches a response would
// silently reintroduce the leak this type is built to prevent.
export interface Item {
  id: number;
  title: string;
  priceCents: number;
  email: string;
  createdAt: string;
}

// Mirrors exactly the columns selected below — not the full table shape.
// claimed exists in the schema (Req 1) but nothing in this sprint reads or
// writes it (see sprint file's Out of Scope), so it is deliberately absent
// here too, not just unused.
interface ItemRow {
  id: number;
  title: string;
  price_cents: number;
  email: string;
  created_at: Date;
}

function rowToItem(row: ItemRow): Item {
  return {
    id: row.id,
    title: row.title,
    priceCents: row.price_cents,
    email: row.email,
    createdAt: row.created_at.toISOString(),
  };
}

export async function listItems(): Promise<Item[]> {
  const result = await query<ItemRow>(
    `SELECT id, title, price_cents, email, created_at
     FROM items
     ORDER BY created_at DESC`
  );
  return result.rows.map(rowToItem);
}

export async function createItem(input: ValidatedItemInput): Promise<Item> {
  // crypto.randomBytes, not Math.random (Req 3): Math.random is not a
  // cryptographically secure source and is predictable enough that claim
  // links generated from it could be guessed/enumerated. 32 bytes = 256
  // bits of entropy, well over the 128-bit minimum.
  const claimToken = randomBytes(32).toString("hex");

  const result = await query<ItemRow>(
    `INSERT INTO items (title, price_cents, email, claim_token)
     VALUES ($1, $2, $3, $4)
     RETURNING id, title, price_cents, email, created_at`,
    [input.title, input.priceCents, input.email, claimToken]
  );
  return rowToItem(result.rows[0]);
}
