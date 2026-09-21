import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Sprint 3, Req 9: the claim page carries a secret in its URL path.
  // These headers are the two mitigations that make that trade-off
  // acceptable — the token must never enter a search index, and it must
  // never leave via a Referer header on outbound navigation from the page.
  async headers() {
    return [
      {
        source: "/claim/:token",
        headers: [
          { key: "X-Robots-Tag", value: "noindex" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
};

export default nextConfig;
