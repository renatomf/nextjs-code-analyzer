import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, it } from "vitest";

import { chunkProjectFiles } from "@/lib/analysis/chunking";
import { RAG_TOP_K } from "@/lib/limits";
import { embedQuery, embedTexts } from "@/modules/ingestion/server";

import { loadRepo, loadThisRepository, REPO_CASES } from "../repos/repos";
import { RETRIEVAL_CASES } from "./questions";

// Chat retrieval eval (no LLM, no cost): does the chat's context hold the
// code that answers the question? Same chunking and the same local
// embedding model as production; the search is the exact cosine top-k that
// pgvector runs today (no index yet: a dot product of normalized vectors).
// Writes evals/results/<date>-<commit>-retrieval.json.

const git = (...args: string[]) => execFileSync("git", args).toString().trim();

async function filesOf(repo: string) {
  if (repo === "this-repository") return loadThisRepository();
  const repoCase = REPO_CASES.find((c) => c.name === repo);
  if (!repoCase) throw new Error(`Unknown repository ${repo}`);
  return loadRepo(repoCase);
}

const dot = (a: number[], b: number[]) => a.reduce((sum, value, i) => sum + value * b[i], 0);

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
    const files = await filesOf(retrievalCase.repo);
    const paths = new Set(files.map((f) => f.relativePath));
    const chunks = chunkProjectFiles(files);
    const vectors = await embedTexts(chunks.map((c) => c.content));

    const questions: QuestionResult[] = [];
    for (const q of retrievalCase.questions) {
      const missing = q.expectedFiles.filter((f) => !paths.has(f));
      if (missing.length === q.expectedFiles.length) {
        throw new Error(`${retrievalCase.repo}: no expected file exists for "${q.question}"`);
      }
      const query = await embedQuery(q.question);
      const top = chunks
        .map((chunk, i) => ({ chunk, score: dot(query, vectors[i]) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, RAG_TOP_K);
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

  expect(cases).toHaveLength(RETRIEVAL_CASES.length);
}, 20 * 60_000);
