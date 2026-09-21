import type { NextRequest } from "next/server";

// Sprint 5, Req 7. Vercel's edge network is the sole proxy in front of
// this deployment — there is no additional, separately-operated proxy
// layer between the internet and Vercel that this app would need to
// account for. Vercel's edge sets x-forwarded-for itself from the actual
// TCP connection it terminates; a client cannot make its own
// X-Forwarded-For header survive to this function unmodified. Reading
// the first entry of that header is therefore reading the value Vercel
// itself put there, not trusting client-supplied input — the same
// first-entry convention @vercel/functions' own `ipAddress()` helper
// uses. It's reimplemented here (a few lines) instead of adding that
// package as a dependency for one header read. x-real-ip is read as a
// single-value fallback for completeness, not because it's expected to
// disagree with x-forwarded-for on Vercel.
//
// Honest limit, stated plainly per Req 7: this identifies a network, not
// a person, and only as reliably as Vercel's own platform guarantee.
// Anyone willing to switch networks or use a VPN defeats it trivially.
// That's accepted here — the goal is discouraging casual scripted junk,
// not resisting a determined attacker. See the sprint's Out of Scope:
// this is explicitly not billed as a security control.
export function getClientIp(request: NextRequest): string | null {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp && realIp.trim().length > 0) {
    return realIp.trim();
  }

  return null;
}
