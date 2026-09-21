import { claimItemByToken, findItemByClaimToken, type Item } from "@/lib/items";
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

const HTML_HEADERS = { "Content-Type": "text/html; charset=utf-8" };

// Req 5: one frozen literal, reused for every reason a token can fail to
// match a row (unknown, malformed, or a row that no longer exists) — there
// is no branch here to construct it differently per reason, so there is
// nothing that could drift apart over time.
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
  // Req 10: a distinct response, both in status and in visible text, from
  // notFoundResponse() above — a thrown error can never produce this
  // function's caller also calling notFoundResponse(), because they are
  // separate branches in GET/POST below, not one branch with a shared
  // fallback.
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

function renderItemHtml(item: Item, token: string): string {
  const title = escapeHtml(item.title);
  const email = escapeHtml(item.email);
  const claimAction = `/claim/${encodeURIComponent(token)}`;

  // Req 6: a real HTML <form method="POST">, not a link or a GET action —
  // loading this page can never claim the item, only submitting this form
  // can, and submitting it is a POST by construction.
  const actionMarkup = item.claimed
    ? `<p role="status">This item is marked as claimed.</p>`
    : `<form method="POST" action="${claimAction}">
<button type="submit">Mark as claimed</button>
</form>`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><title>${title}</title></head>
<body>
<main>
<h1>${title}</h1>
<p>${formatPriceCents(item.priceCents)}</p>
<p><a href="mailto:${email}">${email}</a></p>
${actionMarkup}
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

  // Req 10: the error branch is checked and returned first, before the
  // not-found branch even runs — a thrown lookup error cannot fall
  // through into notFoundResponse().
  if (item === "error") {
    return errorResponse();
  }
  if (item === null) {
    return notFoundResponse();
  }

  return new Response(renderItemHtml(item, token), {
    status: 200,
    headers: HTML_HEADERS,
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  let item: Item | null;
  try {
    // Req 6/7: the one and only write path for `claimed`, an unconditional
    // SET (see lib/items.ts) — idempotent by construction, and there is no
    // corresponding function anywhere that sets it back to false.
    item = await claimItemByToken(token);
  } catch (error) {
    console.error("[claim] claim failed:", error);
    return errorResponse();
  }

  if (!item) {
    return notFoundResponse();
  }

  // Post/Redirect/Get: send the browser back to GET the same URL rather
  // than rendering a result directly from the POST response. This means a
  // page refresh after claiming re-issues a GET (safe, idempotent read),
  // never a replayed POST, and the rendered state always comes from a
  // fresh read rather than being duplicated between two response builders.
  return Response.redirect(
    new URL(`/claim/${encodeURIComponent(token)}`, request.url),
    303
  );
}
