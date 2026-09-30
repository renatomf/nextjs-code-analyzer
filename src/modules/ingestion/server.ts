import "server-only";

import type { ChunkDraft } from "./domain/knowledge";
import { storeKnowledge } from "./application/store-knowledge";
import { onnxEmbedder } from "./infrastructure/onnx-embedder";
import { pgvectorStore } from "./infrastructure/pgvector-store";

/**
 * Public API of the ingestion module — server part (ADR-001). Every
 * `userId` must come from the server session, never from the client.
 */

export { embedQuery, embedTexts } from "./infrastructure/onnx-embedder";
export { searchProjectChunks, type StoredChunk } from "./infrastructure/pgvector-store";

/** Embeds the chunks and replaces the project's knowledge in pgvector. */
export function storeProjectChunks(
  userId: string,
  projectId: string,
  drafts: ChunkDraft[],
): Promise<number> {
  return storeKnowledge({ embedder: onnxEmbedder, store: pgvectorStore }, userId, projectId, drafts);
}
