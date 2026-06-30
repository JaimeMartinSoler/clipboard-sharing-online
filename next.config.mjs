import { createHash } from "node:crypto";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Fully static export — no server runtime, no API routes. This is the
  // structural guarantee behind "user data never leaves the browser".
  output: "export",
  reactStrictMode: true,
  trailingSlash: true,
  // Dev-only proxy: the client always calls the same-origin path `/api/*`
  // (see src/lib/api.ts), which in production is served by the Worker bound to
  // `/api/*` on the Pages domain. Locally the Worker runs on a different origin
  // (`wrangler dev` → :8787), so we proxy `/api/*` through the Next dev server.
  // This keeps requests same-origin from the browser's view — no CORS, and no
  // need to touch api.ts. Rewrites are ignored by `next build` under
  // `output: "export"` (you'll see a warning), so production is unaffected.
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://127.0.0.1:8787/api/:path*",
      },
    ];
  },
  images: {
    unoptimized: true,
  },
  webpack: (config) => {
    // This Next/webpack version feeds `undefined` into the build hasher, which
    // crashes both the bundled WASM xxhash (`WasmHash._updateWithBuffer` →
    // reading 'length' of undefined) and Node's crypto hasher
    // (ERR_INVALID_ARG_TYPE: "data" argument ... Received undefined). Use a
    // crypto-backed SHA-256 hash that ignores empty updates instead of the plain
    // "sha256" string, so the guard survives Next patch bumps.
    class SafeHash {
      #hash = createHash("sha256");
      update(data, inputEncoding) {
        if (data === undefined || data === null) return this;
        this.#hash.update(data, inputEncoding);
        return this;
      }
      digest(encoding) {
        return this.#hash.digest(encoding);
      }
    }
    config.output.hashFunction = SafeHash;
    return config;
  },
};

export default nextConfig;
