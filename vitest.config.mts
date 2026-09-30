import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    // Component tests are *.test.tsx and opt into jsdom per file
    // (`// @vitest-environment jsdom`); everything else runs in node.
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // Need a real Postgres: run with `npm run test:integration`.
    exclude: ["src/**/*.integration.test.ts", "node_modules/**"],
    clearMocks: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "./src"),
    },
  },
});
