import { randomBytes } from "node:crypto";
import { query } from "./db";
import type { ValidatedItemInput } from "./validation";

// Sprint 2, Req 4, unchanged by sprint 3: Item never carries claim_token.
// Sprint 3 adds exactly one type that does (CreatedItem, below) for
// exactly one path (POST /api/items' success response) — everywhere else
// in the system, including the claim page itself, keeps using this type,
// which structurally cannot carry the token.
export interface Item {
  id: number;
  title: string;
  priceCents: number;
  email: string;
  createdAt: string;
  // Sprint 3, Req 8: now read (to render claimed state) for the first
  // time. Still never written anywhere except claimItemByToken's single
  // UPDATE below (Req 7: claiming is one-way, nothing ever sets it back).
  claimed: boolean;
}

// Sprint 3, Req 1: the one carve-out in sprint 2's absolute invariant, and
// it is exactly one field wide. CreatedItem is returned by exactly one
// function (createItem) and read from exactly one place (the POST
// /api/items route handler's response). No other function in this module
// returns this type, so there is no second path that could widen the hole
// by returning it elsewhere later without a reviewer noticing the type
// change.
export interface CreatedItem extends Item {
  claimToken: string;
}

// Mirrors exactly the columns selected below — not the full table shape.
interface ItemRow {
  id: number;
  title: string;
  price_cents: number;
  email: string;
  created_at: Date;
  claimed: boolean;
}

function rowToItem(row: ItemRow): Item {
  return {
    id: row.id,
    title: row.title,
    priceCents: row.price_cents,
    email: row.email,
    createdAt: row.created_at.toISOString(),
    claimed: row.claimed,
  };
}

const ITEM_COLUMNS = "id, title, price_cents, email, created_at, claimed";

export async function listItems(): Promise<Item[]> {
  const result = await query<ItemRow>(
    // id DESC as a tiebreak (sprint 2 QA1 note): created_at alone has no
    // guaranteed tiebreak across requests landing in the same instant.
    `SELECT ${ITEM_COLUMNS}
     FROM items
     ORDER BY created_at DESC, id DESC`
  );
  return result.rows.map(rowToItem);
}

export async function createItem(input: ValidatedItemInput): Promise<CreatedItem> {
  // crypto.randomBytes, not Math.random (Req 3, sprint 2): Math.random is
  // not a cryptographically secure source and is predictable enough that
  // claim links generated from it could be guessed/enumerated. 32 bytes =
  // 256 bits of entropy, well over the 128-bit minimum.
  const claimToken = randomBytes(32).toString("hex");

  const result = await query<ItemRow>(
    `INSERT INTO items (title, price_cents, email, claim_token)
     VALUES ($1, $2, $3, $4)
     RETURNING ${ITEM_COLUMNS}`,
    [input.title, input.priceCents, input.email, claimToken]
  );
  // The only place in the entire codebase claimToken is attached to a
  // returned object — see the module comment above CreatedItem.
  return { ...rowToItem(result.rows[0]), claimToken };
}

// Sprint 3, Req 3/5: looks up by token only, never by id-plus-token — an
// id-first lookup would let a caller learn "this id exists" independently
// of whether the token was right, which is exactly the distinguishing
// signal Req 5 forbids. Returns null uniformly for "no such token" — a
// genuinely unknown token, a malformed one, and one that no longer
// matches any row all take this same path, because there is only one
// query and one branch here, not a per-reason check that could drift.
// Never selects claim_token (see Item's own comment) — the claim page
// already has the token in its URL, but re-emitting it in a rendered
// prop would still widen Req 1's hole, so it stays out even here.
export async function findItemByClaimToken(token: string): Promise<Item | null> {
  const result = await query<ItemRow>(
    `SELECT ${ITEM_COLUMNS}
     FROM items
     WHERE claim_token = $1`,
    [token]
  );
  if (result.rows.length === 0) {
    return null;
  }
  return rowToItem(result.rows[0]);
}

// Sprint 3, Req 6/7: an unconditional SET, not a read-then-write — running
// this twice (or concurrently) leaves claimed true either way, with no
// error and no risk of clobbering a concurrent write. There is no
// corresponding "unclaim" function anywhere in this module (Req 7).
// Same null-for-no-match shape as findItemByClaimToken, and for the same
// reason: the caller must not be able to tell "token didn't match" apart
// from any other reason this could return nothing.
export async function claimItemByToken(token: string): Promise<Item | null> {
  const result = await query<ItemRow>(
    `UPDATE items
     SET claimed = TRUE
     WHERE claim_token = $1
     RETURNING ${ITEM_COLUMNS}`,
    [token]
  );
  if (result.rows.length === 0) {
    return null;
  }
  return rowToItem(result.rows[0]);
}
