import "server-only";

import { RAG_TOP_K } from "@/lib/limits";
import { embedQuery, searchProjectChunks } from "@/modules/ingestion/server";

import type { ChatSource, RetrievedChunk } from "./domain/prompt";

/**
 * Public API of the chat module — server part (ADR-001). Every `userId`
 * must come from the server session, never from the client.
 */

/** The project's code closest to the question, and the sources to show. */
export async function retrieveChatContext(
  userId: string,
  projectId: string,
  question: string,
): Promise<{ chunks: RetrievedChunk[]; sources: ChatSource[] }> {
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
