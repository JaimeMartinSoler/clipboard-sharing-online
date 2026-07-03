import { fileURLToPath } from "node:url";
import {
  cloudflareTest,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
  const migrationsDir = fileURLToPath(new URL("./migrations", import.meta.url));
  const migrations = await readD1Migrations(migrationsDir);

  return {
    plugins: [
      cloudflareTest({
        // Run the Worker entrypoint in the test isolate so Durable Object
        // bindings (RoomDO) resolve without an explicit scriptName.
        main: "./src/index.ts",
        wrangler: { configPath: "./wrangler.toml" },
        miniflare: {
          // Migrations are surfaced to the test worker as a binding so the
          // setup file can apply them against the local D1.
          bindings: {
            TEST_MIGRATIONS: migrations,
            // Small limit keeps the rate-limit test cheap; cases that don't
            // target rate limiting use distinct IPs and reset between runs.
            RATE_LIMIT_MAX: "20",
          },
        },
      }),
    ],
    test: {
      setupFiles: ["./test/apply-migrations.ts"],
    },
  };
});
