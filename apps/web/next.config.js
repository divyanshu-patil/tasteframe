/* global process */
/** @type {import('next').NextConfig} */
const apiBase = process.env.API_BASE_URL ?? "http://127.0.0.1:8000";

const nextConfig = {
  // Lets a production build run beside `next dev` (e.g. NEXT_DIST_DIR=.next-build) without clobbering it.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // The /api proxy streams the analysis; 2–4 large photos + image reasoning can exceed the
  // default 30 s proxy timeout.
  experimental: { proxyTimeout: 120_000 },
  // Browser talks to same-origin /api; Next proxies to FastAPI. API_BASE_URL is server-only.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiBase}/:path*` }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
