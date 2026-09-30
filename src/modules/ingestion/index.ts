/**
 * Public API of the ingestion module — pure part (ADR-001). Safe to import
 * anywhere (the schema uses the embedding size). Server code is in
 * `./server`.
 */

export { EMBEDDING_DIMENSIONS, type ChunkDraft } from "./domain/knowledge";
