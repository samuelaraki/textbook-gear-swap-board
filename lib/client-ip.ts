import type { NextRequest } from "next/server";

// Sprint 5, Req 7 — REWRITTEN in round 2 after QA1's round-1 BLOCKING
// finding (docs/sprints/state/sprint-5.json history has the full audit).
// The round-1 version asserted an edge behaviour ("Vercel sets this
// header") as settled fact in a comment with no evidence, and its
// fallback order was the reverse of the @vercel/functions helper it
// cited to justify that assertion. QA1 demonstrated the consequence
// directly: one client sending three different x-forwarded-for values
// landed in three separate rate-limit buckets — the limit wasn't
// weakened, it was absent.
//
// The amended requirement states the property this code actually has to
// satisfy: a single client sending arbitrary request headers must land
// in exactly one bucket, and must not be able to obtain a fresh
// allowance by varying them. Two things follow from that, independent of
// any assumption about Vercel:
//
// (a) PREFERENCE ORDER — most to least trustworthy, never the reverse of
//     whatever this comment cites:
//       1. x-vercel-forwarded-for — Vercel-namespaced.
//       2. x-real-ip — single-valued; the header @vercel/functions' own
//          ipAddress() helper prefers.
//       3. x-forwarded-for — last resort only.
//
// (b) NEVER THE LEFTMOST ENTRY. Every one of these three is treated as a
//     potential comma-separated chain, and the LAST non-empty entry is
//     used, not the first. The leftmost position is the one a client's
//     own request can simply dictate in every standard appending-proxy
//     chain; taking it is exactly what produced QA1's three-buckets
//     result. The rightmost position is the one most recently appended
//     by whatever actually terminated this connection.
//
// (c) WHAT THIS COMMENT DOES NOT CLAIM. Vercel's own current
//     documentation (https://vercel.com/docs/headers/request-headers,
//     "Request headers" reference, page dated 2025-12-13, read directly
//     2026-09-21) states: "[x-forwarded-for] ... If you are trying to
//     use Vercel behind a proxy, we currently overwrite the
//     X-Forwarded-For header and do not forward external IPs. This
//     restriction is in place to prevent IP spoofing," and of
//     x-vercel-forwarded-for: "This header is identical to the
//     x-forwarded-for header. However, x-forwarded-for could be
//     overwritten if you're using a proxy on top of Vercel." That text
//     is consistent with the design below — but per the amended Req 7c,
//     documentation is not the live measurement this sprint requires,
//     and a static read (of Vercel's docs or of this code) cannot settle
//     whether that description matches what this specific deployment
//     actually receives. It's quoted here as supporting context, not as
//     the basis for a claim this code depends on. This sprint's LiveQA
//     criterion exercises spoofed and accumulated header values against
//     the real, deployed app and is the only thing that can settle it;
//     until that has run, treat the append-vs-replace question as open.
//
// Regardless of how that resolves: this identifies a network, not a
// person. Anyone willing to switch networks or use a VPN defeats it
// trivially — accepted per Req 7, the goal is discouraging casual
// scripted junk, not resisting a determined attacker.
const CLIENT_IP_HEADERS = ["x-vercel-forwarded-for", "x-real-ip", "x-forwarded-for"];

export function getClientIp(request: NextRequest): string | null {
  for (const headerName of CLIENT_IP_HEADERS) {
    const value = request.headers.get(headerName);
    if (!value) {
      continue;
    }
    const entries = value
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    const trusted = entries[entries.length - 1];
    if (trusted) {
      return trusted;
    }
  }

  return null;
}
