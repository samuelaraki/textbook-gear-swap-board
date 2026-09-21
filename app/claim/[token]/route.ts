import {
  claimItemByToken,
  deleteItemByToken,
  findItemByClaimToken,
  type Item,
} from "@/lib/items";
import { formatPriceCents } from "@/lib/format";

export const dynamic = "force-dynamic";

// Sprint 3, Req 3/4/6: this is a Route Handler, not a Next.js Page,
// specifically so the response body is exactly what this file returns —
// nothing more. A Page component under a dynamic segment (`[token]`)
// embeds the requested segment value into its own React Server Component
// hydration payload as part of Next's client-routing state, regardless of
// what the page renders — confirmed by testing, not assumed: two
// different bad tokens through a Page + notFound() produced *different*
// response bodies, each echoing the specific token that was requested,
// which fails Req 5's byte-identical requirement by construction, not by
// a bug in the page's own logic. A Route Handler has no such payload; the
// bytes returned are exactly the bytes below, so byte-identical output
// for every "no such token" case is a structural guarantee, not a
// discipline one — matching how lib/items.ts already makes claim_token's
// containment structural rather than relying on every caller remembering
// to strip it.
//
// Sprint 4 extends this same file with removal, deliberately reusing
// every property above rather than adding a new route, a new failure
// shape, or a new way to distinguish "bad token" from "gone".

const HTML_HEADERS = { "Content-Type": "text/html; charset=utf-8" };

// Req 5 (sprint 3), extended by sprint 4 Req 5: one frozen literal, reused
// for every reason a token can fail to match a row — unknown, malformed,
// or (new in sprint 4) a row that has just been permanently removed. A
// removed item's claim link must be indistinguishable from one that was
// never valid, so this is the exact same function and the exact same
// literal called from the removal path below, not a lookalike.
const NOT_FOUND_HTML = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><title>Claim link not found</title></head>
<body>
<main>
<p>This claim link is not valid.</p>
</main>
</body>
</html>`;

const ERROR_HTML = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><title>Error</title></head>
<body>
<main>
<p role="alert">Could not load this claim link right now. Please try again later.</p>
</main>
</body>
</html>`;

function notFoundResponse(): Response {
  // Req 5: identical status and identical body on every call — no
  // per-request interpolation of any kind into this literal.
  return new Response(NOT_FOUND_HTML, { status: 404, headers: HTML_HEADERS });
}

function errorResponse(): Response {
  // Req 10 (sprint 3) / Req 8 (sprint 4): a distinct response, both in
  // status and in visible text, from notFoundResponse() above — a thrown
  // error can never produce this function's caller also calling
  // notFoundResponse(), because they are separate branches checked in
  // order below, not one branch with a shared fallback. This is the
  // sprint 4 requirement with the highest cost if it drifts: telling a
  // user their post was removed, or that it never existed, when the
  // delete didn't commit leaves their email on a public board while they
  // believe it is gone.
  return new Response(ERROR_HTML, { status: 503, headers: HTML_HEADERS });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Sprint 4, Req 2/3: renders the item plus two independent forms — claim
// (unchanged from sprint 3) and remove. Neither form has an `action`
// attribute (sprint 3 QA1 round 1): a form with no action submits to the
// current document URL, which is already /claim/<token>, so nothing here
// ever needs to interpolate the token into a rendered byte.
//
// Req 3: "Remove this post" does not delete anything by itself — its
// action value is "remove", which the POST handler below only ever turns
// into the *confirmation* interstitial, never a deletion. A single click
// on this button cannot destroy the row; only a second, distinct click on
// that interstitial's own form (action "remove-confirmed") can.
//
// Req 6: the remove form is rendered regardless of item.claimed — removal
// works on both claimed and unclaimed items, unlike the claim form, which
// sprint 3 already hides once claimed is true.
function renderItemHtml(item: Item): string {
  const title = escapeHtml(item.title);
  const email = escapeHtml(item.email);

  const claimSection = item.claimed
    ? `<p role="status">This item is marked as claimed.</p>`
    : `<form method="POST">
<input type="hidden" name="action" value="claim" />
<button type="submit">Mark as claimed</button>
</form>`;

  const removeSection = `<form method="POST">
<input type="hidden" name="action" value="remove" />
<button type="submit">Remove this post</button>
</form>`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><title>${title}</title></head>
<body>
<main>
<h1>${title}</h1>
<p>${formatPriceCents(item.priceCents)}</p>
<p><a href="mailto:${email}">${email}</a></p>
${claimSection}
${removeSection}
</main>
</body>
</html>`;
}

// Sprint 4, Req 3: the confirmation interstitial. Its only form carries
// action "remove-confirmed" — the one value the POST handler below treats
// as authorization to actually delete. There is no cancel *link* here on
// purpose: a link back to /claim/<token> would have to spell the token
// out in an href, which is exactly the class of leak sprint 3's QA1 round
// 1 fix removed from this same file. Doing nothing (closing the tab,
// navigating away) is the cancel path, and it costs nothing to leave
// unbuilt.
function renderRemoveConfirmHtml(item: Item): string {
  const title = escapeHtml(item.title);

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><title>Confirm removal</title></head>
<body>
<main>
<p>Remove "${title}" from the board? This permanently deletes the post and cannot be undone.</p>
<form method="POST">
<input type="hidden" name="action" value="remove-confirmed" />
<button type="submit">Yes, permanently remove this post</button>
</form>
</main>
</body>
</html>`;
}

async function lookup(token: string): Promise<Item | null | "error"> {
  try {
    return await findItemByClaimToken(token);
  } catch (error) {
    console.error("[claim] lookup failed:", error);
    return "error";
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const item = await lookup(token);

  // Req 10 (sprint 3): the error branch is checked and returned first,
  // before the not-found branch even runs — a thrown lookup error cannot
  // fall through into notFoundResponse(). A removed item reaches this
  // same GET handler on its next load (Req 7, sprint 4) and takes the
  // ordinary not-found branch below, because deletion made it a token
  // that matches no row — no special case for "was removed" exists.
  if (item === "error") {
    return errorResponse();
  }
  if (item === null) {
    return notFoundResponse();
  }

  return new Response(renderItemHtml(item), {
    status: 200,
    headers: HTML_HEADERS,
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  // Req 4: dispatch reads the submitted form field, never the query
  // string or any GET-visible input — this handler is POST-only by
  // definition (there is no GET branch that reaches any of this), so a
  // link previewer, crawler, or plain GET can reach none of these three
  // actions, including removal.
  const formData = await request.formData().catch(() => null);
  const action = formData?.get("action");

  if (action === "remove") {
    // Step 1 of 2 (Req 3): show the interstitial only. No mutation of any
    // kind happens on this branch — not a call to deleteItemByToken, not
    // even a call to claimItemByToken. A single request with action
    // "remove" can only ever produce a confirmation page or a
    // not-found/error response, never a deleted row.
    const item = await lookup(token);
    if (item === "error") {
      return errorResponse();
    }
    if (item === null) {
      return notFoundResponse();
    }
    return new Response(renderRemoveConfirmHtml(item), {
      status: 200,
      headers: HTML_HEADERS,
    });
  }

  if (action === "remove-confirmed") {
    // Step 2 of 2: the only branch in this entire file that can delete a
    // row, and it is reachable only by a second, distinct POST carrying
    // this exact value — never by the button on the item page itself,
    // which only ever sends "remove" (above).
    let deleted: boolean;
    try {
      // Req 8: deleteItemByToken's return value comes from the driver's
      // reported row count, not from "the query didn't throw" — see its
      // own comment in lib/items.ts. A thrown error is caught here and
      // reported as errorResponse(), never as success and never folded
      // into the not-found branch below.
      deleted = await deleteItemByToken(token);
    } catch (error) {
      console.error("[claim] removal failed:", error);
      return errorResponse();
    }

    if (!deleted) {
      // No row matched this token — an unknown token, or one that was
      // already removed by an earlier request. Same function, same
      // literal as every other "no such token" case (Req 5).
      return notFoundResponse();
    }

    // Req 5: deliberately no distinct "removed" response here. Redirect
    // back to the same GET URL, which will now find no row and return
    // exactly notFoundResponse() — the same code path sprint 3 already
    // uses for a token that was never valid, not a lookalike branch that
    // could drift from it.
    return Response.redirect(
      new URL(`/claim/${encodeURIComponent(token)}`, request.url),
      303
    );
  }

  // Default (action "claim", or anything else/missing): sprint 3's
  // existing claim behavior, unchanged.
  let item: Item | null;
  try {
    // Req 6/7 (sprint 3): the one and only write path for `claimed`, an
    // unconditional SET (see lib/items.ts) — idempotent by construction,
    // and there is no corresponding function anywhere that sets it back
    // to false.
    item = await claimItemByToken(token);
  } catch (error) {
    console.error("[claim] claim failed:", error);
    return errorResponse();
  }

  if (!item) {
    return notFoundResponse();
  }

  // Post/Redirect/Get: send the browser back to GET the same URL rather
  // than rendering a result directly from the POST response.
  return Response.redirect(
    new URL(`/claim/${encodeURIComponent(token)}`, request.url),
    303
  );
}
