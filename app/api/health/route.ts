import { NextResponse } from "next/server";
import { query } from "@/lib/db";

// Required so this route is never statically rendered or cached: without
// it, Next.js can evaluate this handler once at build time and serve that
// frozen response forever, which would report a permanent 200 with a
// build-time timestamp even while the database is down (sprint 1, req 6).
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await query<{ ok: number }>("SELECT 1 AS ok");

    // Only reachable after the query above has resolved successfully —
    // there is no path to a 200 response that does not pass through a
    // completed round-trip (sprint 1, req 5).
    if (result.rows[0]?.ok !== 1) {
      throw new Error("Unexpected result from database round-trip");
    }

    return NextResponse.json(
      {
        status: "ok",
        // Generated here, inside the request handler, not at module scope,
        // so it reflects the actual time of this request rather than the
        // time the server process started or the module was first loaded.
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error) {
    // Full detail (including anything driver- or connection-specific) goes
    // to server logs only. The response body is generic and non-identifying
    // on purpose: it must never leak a connection string, host, credential,
    // or raw driver stack trace (sprint 1, req 7).
    console.error("[api/health] database round-trip failed:", error);

    return NextResponse.json(
      {
        status: "error",
        timestamp: new Date().toISOString(),
        message: "Service unavailable",
      },
      { status: 503 }
    );
  }
}
