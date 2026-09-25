import { env, pipeline } from "@xenova/transformers";

// Run fully from the Hugging Face hub cache; no local model path required.
env.allowLocalModels = false;

export const EMBEDDING_DIMENSIONS = 384;
const BATCH_SIZE = 16;
const MODEL_ID = "Xenova/all-MiniLM-L6-v2";

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
    extractorPromise = pipeline(
      "feature-extraction",
      MODEL_ID,
    ) as Promise<FeatureExtractor>;
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
export async function embedTexts(texts: string[]): Promise<number[][]> {
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

/** Embed a single query string for similarity search. */
export async function embedQuery(text: string): Promise<number[]> {
  const [embedding] = await embedTexts([text]);
  return embedding;
}
