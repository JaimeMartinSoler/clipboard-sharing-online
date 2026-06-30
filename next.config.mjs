import { createHash } from "node:crypto";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Fully static export — no server runtime, no API routes. This is the
  // structural guarantee behind "user data never leaves the browser".
  output: "export",
  reactStrictMode: true,
  trailingSlash: true,
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
