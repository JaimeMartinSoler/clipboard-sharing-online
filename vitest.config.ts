import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  // tsconfig's `jsx: "preserve"` is for Next; tests that render a component
  // (faq.test.ts) need the React 17+ automatic runtime instead.
  esbuild: { jsx: "automatic" },
  test: {
    // Crypto + API-client logic is pure — no DOM needed. Node 22 exposes a
    // global WebCrypto (`crypto.subtle`) and hash-wasm runs fine here.
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
