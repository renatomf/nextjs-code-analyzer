import { describe, expect, it } from "vitest";

import { EMBEDDING_DIMENSIONS } from "../domain/knowledge";
import golden from "./__fixtures__/minilm-golden.json";
import { MODEL_REVISION, embedTexts } from "./onnx-embedder";

// Opt-in: downloads the real model (~23 MB) from the Hugging Face hub.
// Run with `RUN_MODEL_TESTS=1 npx vitest run embeddings.model` whenever the
// embedding library, model, revision or dtype changes.
//
// The golden vectors were recorded with @xenova/transformers@2.17.2, the
// library that produced the embeddings already stored in `code_chunks`.
// If this test fails, stored vectors and new query vectors no longer live in
// the same space: re-embed every project before shipping the change.
//
// Tolerances (measured when migrating to @huggingface/transformers 4.3):
// tokens and fp32 outputs are identical; the q8 model differs on some inputs
// (onnxruntime 1.14 -> 1.30 dynamic quantization rounding), worst case
// cosine 0.99884 / max abs diff 0.0078. Quantization itself moves vectors
// further from fp32 (cosine ~0.994, max abs diff ~0.02), so this drift is
// inside the noise the index already tolerates.
const MIN_COSINE = 0.998;
const MAX_ABS_DIFF = 0.01;

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / Math.sqrt(normA * normB);
}

describe.skipIf(!process.env.RUN_MODEL_TESTS)("embeddings (real model)", () => {
  it("uses the same model revision as the golden vectors", () => {
    expect(MODEL_REVISION).toBe(golden.revision);
  });

  it(
    "reproduces the vectors stored by the previous library",
    async () => {
      const vectors = await embedTexts(golden.cases.map((c) => c.text));

      for (const [i, testCase] of golden.cases.entries()) {
        const vector = vectors[i];
        expect(vector).toHaveLength(EMBEDDING_DIMENSIONS);
        expect(cosine(vector, testCase.embedding)).toBeGreaterThan(MIN_COSINE);

        const maxDiff = Math.max(
          ...vector.map((value, j) => Math.abs(value - testCase.embedding[j])),
        );
        expect(maxDiff).toBeLessThan(MAX_ABS_DIFF);
      }
    },
    120_000,
  );
});
