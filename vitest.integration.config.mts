import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

// Integration tests: real Postgres (+ pgvector), real Drizzle migrations.
// Run with DATABASE_URL pointing to a local, disposable database.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.integration.test.ts"],
    globalSetup: ["src/test/integration/global-setup.ts"],
    // One shared database: files must not interleave their inserts/cleanup.
    fileParallelism: false,
    env: { DATABASE_SSL: "disable" },
    clearMocks: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "./src"),
      "server-only": path.resolve(rootDir, "./src/test/server-only-stub.ts"),
    },
  },
});
