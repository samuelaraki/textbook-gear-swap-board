import { NextRequest, NextResponse } from "next/server";
import { createItem, listItems } from "@/lib/items";
import { validateItemInput } from "@/lib/validation";
import { checkRateLimit, RATE_LIMIT_WINDOW_SECONDS } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/client-ip";
import { isHoneypotTriggered } from "@/lib/spam-guard";

// Same reason as sprint 1's /api/health (Req 8): without this, Next.js can
// evaluate/cache this route at build time, and a newly posted item would
// never show up for a visitor served that frozen response.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const items = await listItems();
    return NextResponse.json({ items }, { status: 200 });
  } catch (error) {
    // Full detail (connection/driver specifics) goes to server logs only.
    // Req 11: no response body may contain a connection string, host,
    // credential, or raw driver stack trace on any failure path.
    console.error("[api/items] GET failed:", error);
    return NextResponse.json(
      { error: "Could not load items right now." },
      { status: 503 }
    );
  }
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 }
    );
  }

  // Sprint 5, Req 5/8: the honeypot is checked before validation and
  // before anything reaches the database. A submission with it filled is
  // rejected with the exact same shape (400, { error: string }) as an
  // ordinary validation failure below — there is no separate branch or
  // marker that would let a client tell the two apart from the response
  // alone. A body that isn't an object at all falls through to
  // validateItemInput, which already rejects that shape on its own.
  if (
    typeof body === "object" &&
    body !== null &&
    isHoneypotTriggered(body as Record<string, unknown>)
  ) {
    return NextResponse.json(
      { error: "Request could not be processed." },
      { status: 400 }
    );
  }

  // Req 6 (sprint 2): validation runs before anything reaches the
  // database. A rejected request never gets as far as an insert attempt,
  // so there is no row to have written and no cleanup path to get wrong.
  const result = validateItemInput(body);
  if (!result.valid) {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }

  // Sprint 5, Req 1/2/8: rate limit is checked only after the honeypot
  // and full validation have both passed — a client burning its own
  // limit on typos or a bot's honeypot-tripping junk would be a worse
  // outcome than checking this last, right before the write it's meant
  // to gate. Nothing above this point ever reaches an insert, so nothing
  // rejected by validation or the honeypot ever consumes a slot of the
  // rate limit either.
  const clientIp = getClientIp(request);
  // Req 7: on Vercel this is effectively never null (see lib/client-ip.ts).
  // The rare case it is (local dev, a header-stripping intermediary) is
  // bucketed into one shared key rather than skipped outright — an
  // unidentified client still gets a (coarser, shared) cap rather than an
  // unlimited one.
  const clientKey = clientIp ?? "unknown";

  let limited = false;
  let retryAfterSeconds = RATE_LIMIT_WINDOW_SECONDS;
  try {
    const rateLimitResult = await checkRateLimit(clientKey);
    limited = !rateLimitResult.allowed;
    retryAfterSeconds = rateLimitResult.retryAfterSeconds;
  } catch (error) {
    // Sprint 5, Req 6: fail OPEN, deliberately. If the shared rate-limit
    // store is unreachable, posting must keep working — refusing every
    // post because a counter table is down would turn a spam-prevention
    // feature into a total outage. The failure is still logged so it's
    // visible operationally. Do not change this to fail-closed without
    // revisiting Req 6 in the sprint file first; this trade was made on
    // purpose, not arrived at by accident.
    console.error(
      "[api/items] rate limit check failed, failing open (posting still allowed):",
      error
    );
    limited = false;
  }

  if (limited) {
    // Req 3: no mention of the limit's numeric policy, the store, or any
    // other client's activity — just enough for a human to understand
    // what happened and that trying again later will work.
    return NextResponse.json(
      { error: "You're posting too quickly. Please wait and try again." },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfterSeconds) },
      }
    );
  }

  try {
    // Sprint 3, Req 1: this is now the one deliberate exception to sprint
    // 2's absolute claim_token invariant — createItem returns CreatedItem
    // (Item + claimToken), and this response is the only place in the
    // system that type is ever read. Every other function in lib/items.ts
    // still returns plain Item, which has no claim_token field to leak.
    const item = await createItem(result.data);
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    console.error("[api/items] POST failed:", error);
    return NextResponse.json(
      { error: "Could not create the item right now." },
      { status: 503 }
    );
  }
}
