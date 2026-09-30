import { describe, expect, it, vi } from "vitest";

import { DomainError } from "@/shared/errors";

import type { ChunkDraft, EmbeddedChunk } from "../domain/knowledge";
import type { Embedder, VectorStore } from "./ports";
import { storeKnowledge } from "./store-knowledge";

// The use case with fakes: no database, no 23 MB model.

const drafts: ChunkDraft[] = [
  { filePath: "src/a.ts", content: "function a() {}", startLine: 1, endLine: 1 },
  { filePath: "src/b.ts", content: "function b() {}", startLine: 3, endLine: 5 },
];

function fakeEmbedder(): Embedder & { calls: string[][] } {
  const calls: string[][] = [];
  return {
    calls,
    async embed(texts) {
      calls.push(texts);
      return texts.map((_, i) => [i, i]);
    },
  };
}

function inMemoryStore(): VectorStore & { saved: Map<string, EmbeddedChunk[]> } {
  const saved = new Map<string, EmbeddedChunk[]>();
  return {
    saved,
    async replaceProjectChunks(userId, projectId, chunks) {
      saved.set(`${userId}/${projectId}`, chunks);
    },
  };
}

describe("storeKnowledge", () => {
  it("embeds every chunk in order and stores each with its vector", async () => {
    const embedder = fakeEmbedder();
    const store = inMemoryStore();

    const count = await storeKnowledge({ embedder, store }, "u1", "p1", drafts);

    expect(count).toBe(2);
    expect(embedder.calls).toEqual([["function a() {}", "function b() {}"]]);
    expect(store.saved.get("u1/p1")).toEqual([
      { ...drafts[0], embedding: [0, 0] },
      { ...drafts[1], embedding: [1, 1] },
    ]);
  });

  it("rejects an empty chunk list with a user-facing error, touching nothing", async () => {
    const embedder = fakeEmbedder();
    const store = inMemoryStore();

    await expect(storeKnowledge({ embedder, store }, "u1", "p1", [])).rejects.toBeInstanceOf(
      DomainError,
    );
    expect(embedder.calls).toEqual([]);
    expect(store.saved.size).toBe(0);
  });

  it("keeps the previous knowledge when embedding fails", async () => {
    const store = inMemoryStore();
    const replace = vi.spyOn(store, "replaceProjectChunks");
    const failing: Embedder = { embed: async () => Promise.reject(new Error("model down")) };

    await expect(storeKnowledge({ embedder: failing, store }, "u1", "p1", drafts)).rejects.toThrow(
      "model down",
    );
    expect(replace).not.toHaveBeenCalled();
  });

  it("refuses to store when the embedder returns the wrong number of vectors", async () => {
    const store = inMemoryStore();
    const short: Embedder = { embed: async () => [[0, 0]] };

    await expect(storeKnowledge({ embedder: short, store }, "u1", "p1", drafts)).rejects.toThrow(
      "Embedder returned 1 vectors for 2 chunks",
    );
    expect(store.saved.size).toBe(0);
  });
});
