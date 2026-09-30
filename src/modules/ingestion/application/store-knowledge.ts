import { DomainError } from "@/shared/errors";

import type { ChunkDraft } from "../domain/knowledge";
import type { Embedder, VectorStore } from "./ports";

/**
 * Embeds a project's chunks and replaces its stored knowledge. Embedding is
 * slow, so it runs before the store is touched: if it fails, the previous
 * knowledge stays as it was. `userId` must come from the server session.
 */
export async function storeKnowledge(
  deps: { embedder: Embedder; store: VectorStore },
  userId: string,
  projectId: string,
  drafts: ChunkDraft[],
): Promise<number> {
  if (drafts.length === 0) {
    throw new DomainError("No code chunks were produced from the source files.");
  }

  const embeddings = await deps.embedder.embed(drafts.map((draft) => draft.content));
  if (embeddings.length !== drafts.length) {
    throw new Error(`Embedder returned ${embeddings.length} vectors for ${drafts.length} chunks`);
  }

  await deps.store.replaceProjectChunks(
    userId,
    projectId,
    drafts.map((draft, i) => ({ ...draft, embedding: embeddings[i] })),
  );

  return drafts.length;
}
