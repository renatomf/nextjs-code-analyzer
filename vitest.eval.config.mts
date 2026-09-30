import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

// The LLM eval needs the Groq key: take only the GROQ_* variables from the
// local env files, never the rest (.env.local points to production data).
const groqEnv = loadEnv("development", rootDir, "GROQ_");

// Evals (roadmap Phase 7): measure the analysis on annotated cases and on
// this repository, and write evals/results/<date>-<commit>.json. Run with `npm run eval`.
export default defineConfig({
  test: {
    environment: "node",
    include: ["evals/**/*.eval.ts", "evals/**/*.test.ts"],
    // One run writes one result file.
    fileParallelism: false,
    // The eval prints its summary table.
    disableConsoleIntercept: true,
    env: groqEnv,
  },
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "./src"),
      "server-only": path.resolve(rootDir, "./src/test/server-only-stub.ts"),
    },
  },
});
