/* global process */
/** @type {import('next').NextConfig} */
const apiBase = process.env.API_BASE_URL ?? "http://127.0.0.1:8000";

const nextConfig = {
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
