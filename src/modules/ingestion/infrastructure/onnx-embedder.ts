import { env, pipeline } from "@huggingface/transformers";

import { traced } from "@/shared/tracing";

import type { Embedder } from "../application/ports";
import { EMBEDDING_DIMENSIONS } from "../domain/knowledge";

// Run fully from the Hugging Face hub cache; no local model path required.
env.allowLocalModels = false;
// On Vercel only /tmp is writable; the default cache lives in node_modules.
if (process.env.VERCEL) {
  env.cacheDir = "/tmp/transformers-cache";
}

const BATCH_SIZE = 16;
const MODEL_ID = "Xenova/all-MiniLM-L6-v2";
// Pinned hub commit: the model cannot change under us (TD-05).
export const MODEL_REVISION = "751bff37182d3f1213fa05d7196b954e230abad9";
// q8 = onnx/model_quantized.onnx, the file @xenova/transformers loaded by
// default. Changing it changes the vectors already stored in code_chunks.
const MODEL_DTYPE = "q8";

type EmbeddingOutput = {
  data: Float32Array | number[];
};

type FeatureExtractor = (
  text: string,
  options: { pooling: "mean"; normalize: boolean },
) => Promise<EmbeddingOutput>;

let extractorPromise: Promise<FeatureExtractor> | null = null;

async function getExtractor(): Promise<FeatureExtractor> {
  if (!extractorPromise) {
    // Cold start: downloads (~23MB) and loads the model once per instance.
    extractorPromise = traced("embeddings.model_load", {}, () =>
      pipeline("feature-extraction", MODEL_ID, {
        revision: MODEL_REVISION,
        dtype: MODEL_DTYPE,
      }),
    ) as unknown as Promise<FeatureExtractor>;
  }
  return extractorPromise;
}

function toNumberArray(data: Float32Array | number[]): number[] {
  return Array.from(data);
}

/**
 * Local MiniLM embeddings — no API quota.
 * First call downloads the model (~23MB) into the transformers cache.
 */
export function embedTexts(texts: string[]): Promise<number[][]> {
  return traced("embeddings.embed", { texts: texts.length }, () => embedAll(texts));
}

async function embedAll(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const extractor = await getExtractor();
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const embedded = await Promise.all(
      batch.map(async (text) => {
        const truncated = text.length > 8000 ? text.slice(0, 8000) : text;
        const output = await extractor(truncated, {
          pooling: "mean",
          normalize: true,
        });
        const values = toNumberArray(output.data);
        if (values.length !== EMBEDDING_DIMENSIONS) {
          throw new Error(
            `Unexpected embedding size ${values.length}; expected ${EMBEDDING_DIMENSIONS}`,
          );
        }
        return values;
      }),
    );
    results.push(...embedded);
  }

  return results;
}

export const onnxEmbedder: Embedder = { embed: embedTexts };

/** Embed a single query string for similarity search. */
export async function embedQuery(text: string): Promise<number[]> {
  const [embedding] = await embedTexts([text]);
  return embedding;
}
