import { embedQuery } from "@/lib/analysis/embeddings";
import {
  searchProjectChunks,
  type StoredChunk,
} from "@/lib/analysis/vector-store";
import { RAG_TOP_K } from "@/lib/limits";

export type ChatSource = {
  filePath: string;
  startLine: number | null;
  endLine: number | null;
  score: number;
};

export function buildChatSystemPrompt(options: {
  projectName: string;
  framework: string | null;
  chunks: StoredChunk[];
}): string {
  const context = options.chunks
    .map((chunk, index) => {
      const lines =
        chunk.startLine && chunk.endLine
          ? `L${chunk.startLine}-L${chunk.endLine}`
          : "lines unknown";
      return [
        `### Source ${index + 1}`,
        `File: ${chunk.filePath} (${lines})`,
        "```",
        chunk.content,
        "```",
      ].join("\n");
    })
    .join("\n\n");

  return [
    "You are an AI senior engineer helping a developer understand a codebase.",
    `Project: ${options.projectName}`,
    `Detected framework: ${options.framework ?? "Unknown"}`,
    "",
    "Rules:",
    "- Answer using the retrieved source snippets below as your primary evidence.",
    "- Cite files inline like `src/path/file.ts:L12-L40` when relevant.",
    "- If the sources are insufficient, say what is missing instead of inventing details.",
    "- Be concrete and concise. Prefer explanations tied to real code.",
    "- Do not claim to have run the code or verified runtime behavior.",
    "",
    "Retrieved code sources:",
    context || "(No relevant sources were retrieved.)",
  ].join("\n");
}

/** `userId` must come from the server session. */
export async function retrieveChatContext(
  userId: string,
  projectId: string,
  question: string,
): Promise<{ chunks: StoredChunk[]; sources: ChatSource[] }> {
  const queryEmbedding = await embedQuery(question);
  const chunks = await searchProjectChunks(
    userId,
    projectId,
    queryEmbedding,
    RAG_TOP_K,
  );

  const sources: ChatSource[] = chunks.map((chunk) => ({
    filePath: chunk.filePath,
    startLine: chunk.startLine,
    endLine: chunk.endLine,
    score: chunk.score ?? 0,
  }));

  return { chunks, sources };
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
