import { dataBlock, dataRules, newDataBoundary } from "@/shared/prompt-data";

import { getStructuredLanguageModel } from "@/lib/ai/llm";
import type { ReportIssue } from "@/lib/analysis/report-types";
import { verifyEvidence } from "@/modules/analysis";
import { APICallError, generateObject } from "ai";
import { z } from "zod";

// A slow provider must not hold the analysis request (TD-29).
const LLM_TIMEOUT_MS = 120_000;
// The prompt asks for at most 10; the server enforces it (stored in reports).
const MAX_ISSUES = 10;
const MAX_TITLE = 200;
const MAX_DESCRIPTION = 1_000;

/**
 * Groq answers 400 json_validate_failed when the model writes invalid JSON
 * (seen with quotes holding an unbalanced "{"). Groq recommends a retry.
 */
function isInvalidJsonGeneration(error: unknown): boolean {
  return (
    APICallError.isInstance(error) &&
    error.statusCode === 400 &&
    (error.responseBody ?? "").includes("json_validate_failed")
  );
}

const reportSchema = z.object({
  architectureSummary: z.string(),
  securitySummary: z.string(),
  performanceSummary: z.string(),
  issues: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      severity: z.enum(["critical", "high", "medium", "low"]),
      category: z.enum(["architecture", "security", "performance"]),
      filePath: z.string().nullable(),
      // Verbatim code; verified against what was sent (verifyEvidence).
      quote: z.string().nullable(),
    }),
  ),
});

/** The code is untrusted (TD-28): one data block per chunk. */
function formatChunks(
  chunks: Array<{
    filePath: string;
    content: string;
    startLine: number | null;
    endLine: number | null;
  }>,
  boundary: string,
): string {
  return chunks
    .map((chunk, index) => {
      const lines =
        chunk.startLine && chunk.endLine
          ? `L${chunk.startLine}-L${chunk.endLine}`
          : "lines unknown";
      return dataBlock(
        boundary,
        `Chunk ${index + 1}. File: ${chunk.filePath} (${lines})`,
        chunk.content.slice(0, 2500),
      );
    })
    .join("\n\n");
}

export type LlmReportResult = {
  architectureSummary: string;
  securitySummary: string;
  performanceSummary: string;
  issues: ReportIssue[];
  /** Issues dropped because their quote was not found in the cited file. */
  droppedUnverified: number;
  /** For the evals: which files the model saw, and the tokens it used. */
  sentFilePaths: string[];
  usage: { inputTokens?: number; outputTokens?: number };
};

export async function runLlmHealthReview(options: {
  projectName: string;
  framework: string | null;
  chunks: Array<{
    filePath: string;
    content: string;
    startLine: number | null;
    endLine: number | null;
  }>;
}): Promise<LlmReportResult> {
  // Groq's free tier allows 8000 tokens/minute per model, and a single
  // request above that always fails. Cap the code sent (not just the chunk
  // count) so prompt + answer stay well under it (~3.5 chars per code token).
  const MAX_CODE_CHARS = 16_000;
  const sampled: typeof options.chunks = [];
  let usedChars = 0;
  for (const chunk of options.chunks.slice(0, 24)) {
    const size = Math.min(chunk.content.length, 2500);
    if (usedChars + size > MAX_CODE_CHARS) break;
    sampled.push(chunk);
    usedChars += size;
  }

  const review = () => {
    const boundary = newDataBoundary();
    return generateObject({
      model: getStructuredLanguageModel(),
      schema: reportSchema,
      // Same code, same review: needed for a stable report and a fair eval.
      temperature: 0,
      abortSignal: AbortSignal.timeout(LLM_TIMEOUT_MS),
      instructions: [
        "You are an AI senior engineer reviewing a JavaScript/TypeScript codebase.",
        "Find potential issues for the developer to verify — not certified vulnerabilities or proven bottlenecks.",
        "",
        "Cover these categories only: architecture, security, performance.",
        "Severity guide:",
        "- critical: likely security breach or data loss risk",
        "- high: likely incorrect behavior or major performance problem",
        "- medium: maintainability / structure problem",
        "- low: minor concern",
        "",
        "You see a sample of the project, not all of it: never claim that something is missing from the codebase (tests, validation, error handling) unless the snippets themselves show it.",
        "Report only issues the snippets support. A few precise issues are better than many generic ones; an empty list is a valid answer. At most 10 issues.",
        "Report each root cause once, in its most relevant category.",
        "For an issue about a file, set filePath exactly as written in the snippet header and set quote to the single line of code that shows the problem, copied verbatim. Issues whose quote is not found in that file are discarded.",
        "Use filePath null (and quote null) only for an issue visible across several snippets.",
        ...dataRules(boundary),
      ].join("\n"),
      prompt: [
        `Project: ${options.projectName}`,
        `Framework: ${options.framework ?? "Unknown"}`,
        "",
        "Code snippets:",
        formatChunks(sampled, boundary),
      ].join("\n"),
    });
  };

  // One retry, only for invalid JSON; other errors (auth, quota) fail fast.
  const { object, usage } = await review().catch((error: unknown) => {
    if (isInvalidJsonGeneration(error)) return review();
    throw error;
  });

  // Evidence or out: issues whose quote is not in the code they cite go.
  const verified = verifyEvidence(object.issues, sampled);

  return {
    architectureSummary: object.architectureSummary,
    securitySummary: object.securitySummary,
    performanceSummary: object.performanceSummary,
    issues: verified.findings.slice(0, MAX_ISSUES).map((issue) => ({
      ...issue,
      title: issue.title.slice(0, MAX_TITLE),
      description: issue.description.slice(0, MAX_DESCRIPTION),
    })),
    droppedUnverified: verified.dropped.length,
    sentFilePaths: [...new Set(sampled.map((chunk) => chunk.filePath))],
    usage: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens },
  };
}
