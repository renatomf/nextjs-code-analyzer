import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

// The LLM eval needs a Groq key: take only the GROQ_* variables from the
// local env files, never the rest (.env.local points to production data).
const groqEnv = loadEnv("development", rootDir, "GROQ_");

// Never the production key: Groq's daily token limit is per organization, so
// evals run with production's key would take quota from real analyses. The
// app code reads GROQ_API_KEY; here it is GROQ_EVAL_API_KEY (a separate Groq
// account, from .env.local or a CI secret) or empty, whatever the shell has.
const evalEnv = {
  GROQ_API_KEY: groqEnv.GROQ_EVAL_API_KEY ?? process.env.GROQ_EVAL_API_KEY ?? "",
  ...(groqEnv.GROQ_MODEL ? { GROQ_MODEL: groqEnv.GROQ_MODEL } : {}),
  ...(groqEnv.GROQ_STRUCTURED_MODEL ? { GROQ_STRUCTURED_MODEL: groqEnv.GROQ_STRUCTURED_MODEL } : {}),
};

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
    env: evalEnv,
  },
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "./src"),
      "server-only": path.resolve(rootDir, "./src/test/server-only-stub.ts"),
    },
  },
});
