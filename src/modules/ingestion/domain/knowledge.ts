/**
 * Code knowledge: a project's chunks and their embeddings. Pure.
 */

/**
 * Size of every embedding (MiniLM-L6-v2). Single source for the model
 * adapter and the `vector(...)` column in the schema (TD-04): changing it
 * needs a migration and re-embedding every project.
 */
export const EMBEDDING_DIMENSIONS = 384;

/** A piece of source code bounded by the AST, before it is embedded. */
export type ChunkDraft = {
  filePath: string;
  content: string;
  startLine: number | null;
  endLine: number | null;
};

export type EmbeddedChunk = ChunkDraft & { embedding: number[] };
