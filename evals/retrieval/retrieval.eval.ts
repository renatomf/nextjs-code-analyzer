import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, it } from "vitest";

import { RAG_TOP_K } from "@/lib/limits";

import { RETRIEVAL_CASES } from "./questions";
import { buildIndex, filesOf } from "./retrieve";

// Chat retrieval eval (no LLM, no cost): does the chat's context hold the
// code that answers the question? The retrieval is the chat's (./retrieve).
// Writes evals/results/<date>-<commit>-retrieval.json.

const git = (...args: string[]) => execFileSync("git", args).toString().trim();

type QuestionResult = {
  question: string;
  expectedFiles: string[];
  /** 1-based rank of the first chunk from an expected file; null if none in the top k. */
  rank: number | null;
  retrieved: Array<{ filePath: string; lines: Array<number | null>; score: number }>;
};

type CaseResult = {
  repo: string;
  chunks: number;
  questions: number;
  recallAtK: number;
  hitAt1: number;
  mrr: number;
  details: QuestionResult[];
};

it("measures the chat retrieval", async () => {
  const cases: CaseResult[] = [];

  for (const retrievalCase of RETRIEVAL_CASES) {
    const search = await buildIndex(await filesOf(retrievalCase.repo));
    const { chunks, paths } = search;

    const questions: QuestionResult[] = [];
    for (const q of retrievalCase.questions) {
      const missing = q.expectedFiles.filter((f) => !paths.has(f));
      if (missing.length === q.expectedFiles.length) {
        throw new Error(`${retrievalCase.repo}: no expected file exists for "${q.question}"`);
      }
      const top = await search.search(q.question);
      const index = top.findIndex(({ chunk }) => q.expectedFiles.includes(chunk.filePath));
      questions.push({
        question: q.question,
        expectedFiles: q.expectedFiles,
        rank: index === -1 ? null : index + 1,
        retrieved: top.map(({ chunk, score }) => ({
          filePath: chunk.filePath,
          lines: [chunk.startLine, chunk.endLine],
          score: Number(score.toFixed(4)),
        })),
      });
    }

    const hits = questions.filter((q) => q.rank !== null);
    cases.push({
      repo: retrievalCase.repo,
      chunks: chunks.length,
      questions: questions.length,
      recallAtK: hits.length / questions.length,
      hitAt1: questions.filter((q) => q.rank === 1).length / questions.length,
      mrr: questions.reduce((sum, q) => sum + (q.rank ? 1 / q.rank : 0), 0) / questions.length,
      details: questions,
    });
  }

  const total = cases.reduce((sum, c) => sum + c.questions, 0);
  const weighted = (metric: "recallAtK" | "hitAt1" | "mrr") =>
    cases.reduce((sum, c) => sum + c[metric] * c.questions, 0) / total;
  const result = {
    date: new Date().toISOString(),
    commit: git("rev-parse", "--short", "HEAD"),
    k: RAG_TOP_K,
    retrieval: {
      cases,
      totals: { questions: total, recallAtK: weighted("recallAtK"), hitAt1: weighted("hitAt1"), mrr: weighted("mrr") },
    },
  };

  const dir = join(process.cwd(), "evals", "results");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${result.date.slice(0, 10)}-${result.commit}-retrieval.json`);
  writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`);

  const pct = (v: number) => v.toFixed(2);
  console.log(
    [
      `retrieval eval @ ${result.commit} (top ${RAG_TOP_K}) → ${file}`,
      ...cases.map(
        (c) =>
          `  ${c.repo}: recall@${RAG_TOP_K} ${pct(c.recallAtK)}, hit@1 ${pct(c.hitAt1)}, MRR ${pct(c.mrr)} (${c.questions} questions, ${c.chunks} chunks)` +
          c.details
            .filter((q) => q.rank !== 1)
            .map((q) => `\n    ${q.rank === null ? "miss" : `rank ${q.rank}`}: ${q.question} → ${q.retrieved[0]?.filePath}`)
            .join(""),
      ),
      `  total: recall@${RAG_TOP_K} ${pct(result.retrieval.totals.recallAtK)}, hit@1 ${pct(result.retrieval.totals.hitAt1)}, MRR ${pct(result.retrieval.totals.mrr)}`,
    ].join("\n"),
  );

  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) {
    appendFileSync(
      summary,
      [
        `## Chat retrieval eval @ \`${result.commit}\` (top ${RAG_TOP_K})`,
        "",
        `| Repository | Questions answered in the top ${RAG_TOP_K} | Hit@1 | MRR |`,
        "|---|---|---|---|",
        ...cases.map(
          (c) =>
            `| ${c.repo} | ${c.details.filter((q) => q.rank !== null).length}/${c.questions} (gate ≥ ${GATE[c.repo] ?? 0}) | ${pct(c.hitAt1)} | ${pct(c.mrr)} |`,
        ),
        "",
      ].join("\n"),
    );
  }

  expect(cases).toHaveLength(RETRIEVAL_CASES.length);
  // Quality gate (also in CI): questions answered in the top k may not drop.
  for (const c of cases) {
    const answered = c.details.filter((q) => q.rank !== null).length;
    expect(answered, `${c.repo}: questions answered in the top ${RAG_TOP_K}`).toBeGreaterThanOrEqual(
      GATE[c.repo] ?? 0,
    );
  }
}, 20 * 60_000);

/**
 * Questions answered in the top k, per repository: the baseline of
 * 2026-09-30 (`18b11ed`). Raise when an improvement is merged, never lower.
 */
const GATE: Record<string, number> = { nodegoat: 7, "juice-shop": 2, "this-repository": 3 };
