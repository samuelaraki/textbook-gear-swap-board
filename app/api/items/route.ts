import { NextRequest, NextResponse } from "next/server";
import { createItem, listItems } from "@/lib/items";
import { validateItemInput } from "@/lib/validation";

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

  // Req 6: validation runs before anything reaches the database. A
  // rejected request never gets as far as an insert attempt, so there is
  // no row to have written and no cleanup path to get wrong.
  const result = validateItemInput(body);
  if (!result.valid) {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }

  try {
    // createItem's return type has no claim_token field (Req 4) — nothing
    // needs to be stripped here, because there is nothing to strip.
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
