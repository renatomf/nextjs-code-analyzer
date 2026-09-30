import { dataBlock, dataRules } from "@/shared/prompt-data";
import { promptVersion } from "@/shared/prompt-version";

/**
 * Chat prompt policy and message handling. Pure: retrieval lives in
 * `../server.ts`.
 */

/** A code chunk retrieved for the question. */
export type RetrievedChunk = {
  filePath: string;
  content: string;
  startLine: number | null;
  endLine: number | null;
};

export type ChatSource = {
  filePath: string;
  startLine: number | null;
  endLine: number | null;
  score: number;
};

/**
 * The chat prompt's fixed text (roadmap Phase 7: prompts in versioned
 * files): the role, then the rules. A change gives a new
 * CHAT_PROMPT_VERSION, which evals/prompts.lock.json must record.
 */
export const CHAT_PROMPT = [
  "You are an AI senior engineer helping a developer understand a codebase.",
  "Answer using the retrieved source snippets below as your primary evidence.",
  "Cite files inline like `src/path/file.ts:L12-L40` when relevant.",
  "If the sources are insufficient, say what is missing instead of inventing details.",
  "Be concrete and concise. Prefer explanations tied to real code.",
  "Do not claim to have run the code or verified runtime behavior.",
] as const;

export const CHAT_PROMPT_VERSION = promptVersion(CHAT_PROMPT);

/**
 * The retrieved code is untrusted (TD-28): each source goes in a data block
 * marked with `boundary` (random per request, see `newDataBoundary`).
 */
export function buildChatSystemPrompt(options: {
  projectName: string;
  framework: string | null;
  chunks: RetrievedChunk[];
  boundary: string;
}): string {
  const context = options.chunks
    .map((chunk, index) => {
      const lines =
        chunk.startLine && chunk.endLine
          ? `L${chunk.startLine}-L${chunk.endLine}`
          : "lines unknown";
      return dataBlock(
        options.boundary,
        `Source ${index + 1}. File: ${chunk.filePath} (${lines})`,
        chunk.content,
      );
    })
    .join("\n\n");

  const [role, ...rules] = CHAT_PROMPT;
  return [
    role,
    `Project: ${options.projectName}`,
    `Detected framework: ${options.framework ?? "Unknown"}`,
    "",
    "Rules:",
    ...rules.map((rule) => `- ${rule}`),
    ...dataRules(options.boundary).map((rule) => `- ${rule}`),
    "",
    "Retrieved code sources:",
    context || "(No relevant sources were retrieved.)",
  ].join("\n");
}

export function extractLastUserText(
  messages: Array<{
    role: string;
    parts?: Array<{ type: string; text?: string }>;
    content?: string | Array<{ type: string; text?: string }>;
  }>,
): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (!message || message.role !== "user") continue;

    if (typeof message.content === "string" && message.content.trim()) {
      return message.content.trim();
    }

    if (Array.isArray(message.content)) {
      const text = message.content
        .filter((part) => part.type === "text" && part.text)
        .map((part) => part.text)
        .join("\n")
        .trim();
      if (text) return text;
    }

    if (Array.isArray(message.parts)) {
      const text = message.parts
        .filter((part) => part.type === "text" && part.text)
        .map((part) => part.text)
        .join("\n")
        .trim();
      if (text) return text;
    }
  }

  return "";
}
