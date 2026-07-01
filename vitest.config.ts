import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // Crypto + API-client logic is pure — no DOM needed. Node 22 exposes a
    // global WebCrypto (`crypto.subtle`) and hash-wasm runs fine here.
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
