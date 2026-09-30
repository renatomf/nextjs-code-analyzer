import { dataBlock, dataRules, newDataBoundary } from "@/shared/prompt-data";

import { getStructuredLanguageModel } from "@/lib/ai/llm";
import type { ReportIssue } from "@/lib/analysis/report-types";
import { generateObject } from "ai";
import { z } from "zod";

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

  const boundary = newDataBoundary();
  const { object, usage } = await generateObject({
    model: getStructuredLanguageModel(),
    schema: reportSchema,
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
      "Return at most 15 high-signal issues total.",
      "Use filePath when the snippet supports it; otherwise null.",
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

  return {
    architectureSummary: object.architectureSummary,
    securitySummary: object.securitySummary,
    performanceSummary: object.performanceSummary,
    issues: object.issues,
    sentFilePaths: [...new Set(sampled.map((chunk) => chunk.filePath))],
    usage: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens },
  };
}
