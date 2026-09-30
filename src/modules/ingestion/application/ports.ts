import type { EmbeddedChunk } from "../domain/knowledge";

/** Turns texts into embeddings, in order. ONNX locally; a fake in tests. */
export interface Embedder {
  embed(texts: string[]): Promise<number[][]>;
}

/** Where a project's knowledge lives. pgvector; in memory in tests. */
export interface VectorStore {
  /**
   * Replaces all chunks of the project at once (all or nothing). Throws when
   * the project does not belong to `userId`.
   */
  replaceProjectChunks(userId: string, projectId: string, chunks: EmbeddedChunk[]): Promise<void>;
}
