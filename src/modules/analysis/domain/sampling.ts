import type { ReviewedChunk } from "./evidence";
import { dirname, isTestFile, pathWords } from "./paths";

export type ReviewBudget = {
  /** Most chunks sent to the reviewer. */
  maxChunks: number;
  /** Most characters of code sent (the prompt's token budget). */
  maxChars: number;
  /** Characters of one chunk that are sent (longer chunks are cut). */
  chunkChars: number;
};

// Groq's free tier allows 8000 tokens/minute per model, and a single request
// above that always fails: prompt + answer must stay well under it (~3.5
// characters per code token).
export const REVIEW_BUDGET: ReviewBudget = {
  maxChunks: 24,
  maxChars: 16_000,
  chunkChars: 2_500,
};

// Where the review categories (security, performance, architecture) usually
// live: code that receives input, talks to the database or guards access.
const SERVER_WORDS = new Set([
  "api",
  "route",
  "routes",
  "server",
  "action",
  "actions",
  "auth",
  "db",
  "database",
  "query",
  "queries",
  "payment",
  "payments",
  "billing",
  "webhook",
  "webhooks",
  "middleware",
  "proxy",
  "session",
  "admin",
  "controller",
  "controllers",
  "handler",
  "handlers",
]);

/** 0 = server logic, 1 = other logic, 2 = UI, 3 = configuration and type declarations. */
function priority(filePath: string): number {
  if (/\.config\.[cm]?[jt]s$|\.d\.ts$/i.test(filePath)) return 3;
  if (/\.[jt]sx$/i.test(filePath)) return 2;
  return pathWords(filePath).some((word) => SERVER_WORDS.has(word)) ? 0 : 1;
}

/**
 * Which chunks the LLM reviewer sees, within the budget (roadmap Phase 7
 * item 2). The budget fits a small part of a real project, so the sample is
 * spread instead of the first files in alphabetical order:
 * - tests are left out (unless there is nothing else);
 * - server logic first, then other logic, UI and configuration;
 * - inside each level, one file per directory in turn, so no folder takes
 *   the whole budget; first chunk of every file before the second of any.
 * Deterministic (same project, same sample) and returned in path order.
 */
export function sampleForReview<T extends ReviewedChunk>(
  chunks: T[],
  budget: ReviewBudget = REVIEW_BUDGET,
): T[] {
  const nonTest = chunks.filter((chunk) => !isTestFile(chunk.filePath));
  const candidates = nonTest.length > 0 ? nonTest : chunks;

  const byFile = new Map<string, T[]>();
  for (const chunk of candidates) {
    byFile.set(chunk.filePath, [...(byFile.get(chunk.filePath) ?? []), chunk]);
  }
  for (const fileChunks of byFile.values()) {
    fileChunks.sort((a, b) => (a.startLine ?? 0) - (b.startLine ?? 0));
  }

  const files = [...byFile.keys()].sort(
    (a, b) => priority(a) - priority(b) || a.localeCompare(b),
  );
  const order = interleaveByDirectory(files);

  // Round r takes the r-th chunk of every file, in that order.
  const queue: T[] = [];
  const rounds = Math.max(...[...byFile.values()].map((c) => c.length), 0);
  for (let round = 0; round < rounds; round += 1) {
    for (const file of order) {
      const chunk = byFile.get(file)![round];
      if (chunk) queue.push(chunk);
    }
  }

  const sampled: T[] = [];
  let usedChars = 0;
  for (const chunk of queue) {
    if (sampled.length === budget.maxChunks) break;
    const size = Math.min(chunk.content.length, budget.chunkChars);
    if (usedChars + size > budget.maxChars) continue; // a smaller one may fit
    sampled.push(chunk);
    usedChars += size;
  }

  return sampled.sort(
    (a, b) => a.filePath.localeCompare(b.filePath) || (a.startLine ?? 0) - (b.startLine ?? 0),
  );
}

/**
 * Files already sorted by priority; within each priority level, take one
 * file per directory in turn (a, b, c, a, b, ...).
 */
function interleaveByDirectory(files: string[]): string[] {
  const result: string[] = [];
  let start = 0;
  while (start < files.length) {
    const level = priority(files[start]);
    let end = start;
    while (end < files.length && priority(files[end]) === level) end += 1;

    const byDirectory = new Map<string, string[]>();
    for (const file of files.slice(start, end)) {
      byDirectory.set(dirname(file), [...(byDirectory.get(dirname(file)) ?? []), file]);
    }
    const directories = [...byDirectory.values()];
    for (let i = 0; directories.some((d) => i < d.length); i += 1) {
      for (const directory of directories) if (i < directory.length) result.push(directory[i]);
    }
    start = end;
  }
  return result;
}
