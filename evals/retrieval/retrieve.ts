import { chunkProjectFiles } from "@/lib/analysis/chunking";
import { RAG_TOP_K } from "@/lib/limits";
// The embedder alone: the module entry point also loads the database client.
import { embedQuery, embedTexts } from "@/modules/ingestion/infrastructure/onnx-embedder";

import { loadRepo, loadThisRepository, REPO_CASES } from "../repos/repos";

/**
 * The chat's retrieval, for the evals: the same chunking and local embedding
 * model as production, and the exact cosine top-k that pgvector runs today
 * (no index yet: a dot product of normalized vectors).
 */

// The retrieval eval's own questions, word for word: indexed, they would
// answer every question about this repository.
const OWN_QUESTIONS_FILE = "evals/retrieval/questions.ts";

export async function filesOf(repo: string) {
  if (repo === "this-repository") {
    return (await loadThisRepository()).filter((f) => f.relativePath !== OWN_QUESTIONS_FILE);
  }
  const repoCase = REPO_CASES.find((c) => c.name === repo);
  if (!repoCase) throw new Error(`Unknown repository ${repo}`);
  return loadRepo(repoCase);
}

const dot = (a: number[], b: number[]) => a.reduce((sum, value, i) => sum + value * b[i], 0);

export async function buildIndex(files: { relativePath: string; content: string }[]) {
  const chunks = chunkProjectFiles(files);
  const vectors = await embedTexts(chunks.map((c) => c.content));

  return {
    chunks,
    paths: new Set(files.map((f) => f.relativePath)),
    /** The top-k chunks for a question, best first, with their scores. */
    async search(question: string, k = RAG_TOP_K) {
      const query = await embedQuery(question);
      return chunks
        .map((chunk, i) => ({ chunk, score: dot(query, vectors[i]) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, k);
    },
  };
}
