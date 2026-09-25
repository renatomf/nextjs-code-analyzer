import { and, cosineDistance, eq, exists, sql } from "drizzle-orm";

import { codeChunks, projects } from "@/db/schema";
import type { CodeChunkDraft } from "@/lib/analysis/chunking";
import { embedTexts } from "@/lib/analysis/embeddings";
import { db } from "@/lib/db";

export type StoredChunk = {
  id: string;
  filePath: string;
  content: string;
  startLine: number | null;
  endLine: number | null;
  score?: number;
};

// Every function is scoped by the owner's `userId` (from the server session,
// never from the client) in addition to `projectId`.

/** Replace all code chunks for a project and store embeddings in pgvector. */
export async function storeProjectChunks(
  userId: string,
  projectId: string,
  drafts: CodeChunkDraft[],
): Promise<number> {
  if (drafts.length === 0) {
    throw new Error("No code chunks were produced from the source files.");
  }

  // Embedding is slow: done before the transaction so it is not held open.
  const embeddings = await embedTexts(drafts.map((draft) => draft.content));

  await db.transaction(async (tx) => {
    const [project] = await tx
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
    if (!project) throw new Error("Project not found");

    await tx.delete(codeChunks).where(eq(codeChunks.projectId, projectId));

    const INSERT_BATCH = 100;
    for (let i = 0; i < drafts.length; i += INSERT_BATCH) {
      const batch = drafts.slice(i, i + INSERT_BATCH);
      await tx.insert(codeChunks).values(
        batch.map((draft, offset) => ({
          projectId,
          filePath: draft.filePath,
          content: draft.content,
          startLine: draft.startLine,
          endLine: draft.endLine,
          embedding: embeddings[i + offset]!,
        })),
      );
    }
  });

  return drafts.length;
}

/** Top-k similarity search over a project's code chunks. */
export async function searchProjectChunks(
  userId: string,
  projectId: string,
  queryEmbedding: number[],
  limit = 8,
): Promise<StoredChunk[]> {
  const distance = cosineDistance(codeChunks.embedding, queryEmbedding);

  return db
    .select({
      id: codeChunks.id,
      filePath: codeChunks.filePath,
      content: codeChunks.content,
      startLine: codeChunks.startLine,
      endLine: codeChunks.endLine,
      score: sql<number>`1 - (${distance})`.mapWith(Number),
    })
    .from(codeChunks)
    .where(
      and(
        eq(codeChunks.projectId, projectId),
        exists(
          db
            .select({ id: projects.id })
            .from(projects)
            .where(and(eq(projects.id, projectId), eq(projects.userId, userId))),
        ),
      ),
    )
    .orderBy(distance)
    .limit(limit);
}
