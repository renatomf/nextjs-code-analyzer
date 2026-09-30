import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, it } from "vitest";

import { chunkProjectFiles } from "@/lib/analysis/chunking";
import { runLlmHealthReview } from "@/lib/analysis/report-llm";

import { LLM_CASES } from "./cases";

// LLM review eval (opt-in: real model, uses the free Groq quota):
//   RUN_LLM_EVAL=1 npm run eval
// Each case runs LLM_EVAL_RUNS times (default 3) to measure stability too.
// Calls are spaced out to stay under the free tier's tokens per minute.

const enabled = process.env.RUN_LLM_EVAL === "1";
const RUNS = Number(process.env.LLM_EVAL_RUNS ?? 3);
const PAUSE_MS = Number(process.env.LLM_EVAL_PAUSE_MS ?? 20_000);

const key = (category: string, filePath: string | null) => `${category}:${filePath ?? "-"}`;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function jaccard(a: Set<string>, b: Set<string>) {
  const union = new Set([...a, ...b]);
  if (union.size === 0) return 1;
  return [...a].filter((item) => b.has(item)).length / union.size;
}

it.skipIf(!enabled)(
  "measures the LLM review",
  async () => {
    const cases = [];
    let first = true;

    for (const evalCase of LLM_CASES) {
      // Same order the report uses: by file, then by line.
      const chunks = chunkProjectFiles(evalCase.files).sort(
        (a, b) =>
          a.filePath.localeCompare(b.filePath) || (a.startLine ?? 0) - (b.startLine ?? 0),
      );
      const runs = [];
      const failures: Array<{ error: string; responseBody?: string }> = [];

      for (let run = 0; run < RUNS; run += 1) {
        if (!first) await sleep(PAUSE_MS);
        first = false;
        const started = Date.now();
        let review: Awaited<ReturnType<typeof runLlmHealthReview>>;
        try {
          review = await runLlmHealthReview({
            projectName: evalCase.name,
            framework: null,
            chunks,
          });
        } catch (error) {
          // A failed call is a result too (reliability), not the end of the eval.
          const body = (error as { responseBody?: string }).responseBody;
          failures.push({ error: String(error), responseBody: body?.slice(0, 4000) });
          continue;
        }
        const found = new Set(review.issues.map((issue) => key(issue.category, issue.filePath)));
        const withFile = review.issues.filter((issue) => issue.filePath);
        runs.push({
          latencyMs: Date.now() - started,
          usage: review.usage,
          droppedUnverified: review.droppedUnverified,
          // Sampling, apart from the model: expected files the reviewer received.
          expectedSent:
            evalCase.expected.filter((e) => review.sentFilePaths.includes(e.filePath)).length /
            evalCase.expected.length,
          issues: review.issues.map(({ title, severity, category, filePath }) => ({
            title,
            severity,
            category,
            filePath,
          })),
          recall:
            evalCase.expected.filter((e) => found.has(key(e.category, e.filePath))).length /
            evalCase.expected.length,
          // A cited file the model never saw is a hallucination.
          evidenceValidity:
            withFile.length === 0
              ? 1
              : withFile.filter((issue) => review.sentFilePaths.includes(issue.filePath!)).length /
                withFile.length,
          keys: [...found],
        });
      }

      const sets = runs.map((run) => new Set(run.keys));
      const pairs: number[] = [];
      for (let i = 0; i < sets.length; i += 1) {
        for (let j = i + 1; j < sets.length; j += 1) pairs.push(jaccard(sets[i], sets[j]));
      }
      const mean = (values: number[]) =>
        values.length === 0 ? 1 : values.reduce((sum, v) => sum + v, 0) / values.length;

      cases.push({
        name: evalCase.name,
        runs: runs.length,
        failedRuns: failures.length,
        meanExpectedSent: mean(runs.map((r) => r.expectedSent)),
        meanRecall: mean(runs.map((r) => r.recall)),
        minRecall: runs.length === 0 ? 0 : Math.min(...runs.map((r) => r.recall)),
        meanEvidenceValidity: mean(runs.map((r) => r.evidenceValidity)),
        stability: mean(pairs),
        meanFindings: mean(runs.map((r) => r.issues.length)),
        meanDroppedUnverified: mean(runs.map((r) => r.droppedUnverified)),
        meanLatencyMs: Math.round(mean(runs.map((r) => r.latencyMs))),
        meanInputTokens: Math.round(mean(runs.map((r) => r.usage.inputTokens ?? 0))),
        meanOutputTokens: Math.round(mean(runs.map((r) => r.usage.outputTokens ?? 0))),
        runDetails: runs,
        failures,
      });
    }

    const commit = execFileSync("git", ["rev-parse", "--short", "HEAD"]).toString().trim();
    const date = new Date().toISOString();
    const result = {
      date,
      commit,
      model: process.env.GROQ_STRUCTURED_MODEL ?? "openai/gpt-oss-120b",
      llm: { cases },
    };
    const dir = join(process.cwd(), "evals", "results");
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${date.slice(0, 10)}-${commit}-llm.json`);
    writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`);

    console.log(
      [
        `llm eval @ ${commit} (${result.model}) → ${file}`,
        ...cases.map(
          (c) =>
            `  ${c.name}: sent ${c.meanExpectedSent.toFixed(2)}, recall ${c.meanRecall.toFixed(2)} (min ${c.minRecall.toFixed(2)}), ` +
            `evidence ${c.meanEvidenceValidity.toFixed(2)}, stability ${c.stability.toFixed(2)}, ` +
            `${c.failedRuns} failed, ${c.meanFindings.toFixed(1)} findings (${c.meanDroppedUnverified.toFixed(1)} dropped), ${c.meanLatencyMs} ms, ${c.meanInputTokens}+${c.meanOutputTokens} tokens`,
        ),
      ].join("\n"),
    );

    expect(cases).toHaveLength(LLM_CASES.length);
  },
  30 * 60_000,
);
