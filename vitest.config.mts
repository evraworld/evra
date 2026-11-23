import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));
const live = process.env.EVRA_LIVE === "1";

export default defineConfig({
  resolve: { alias: { "@": root } },
  test: {
    environment: "node",
    include: live ? ["tests/live/**/*.test.ts"] : ["tests/unit/**/*.test.ts", "lib/**/*.test.ts"],
    env: live ? {} : { DATABASE_URL: "memory://", SESSION_SECRET: "s".repeat(64) },
    testTimeout: live ? 240_000 : 60_000,
    hookTimeout: 120_000,
    pool: "forks",
  },
});
