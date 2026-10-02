// SPIKE (ADR-005) — throwaway, never merged. Answers three questions on a
// Vercel preview: does the ONNX model load inside a step, do retries and
// FatalError behave as documented, and how many functions does the build
// produce. Steps return numbers only.
import { FatalError, getStepMetadata, RetryableError } from "workflow";

async function embedProbe(): Promise<{ dims: number; ms: number }> {
  "use step";
  const started = Date.now();
  const { embedTexts } = await import(
    "@/modules/ingestion/infrastructure/onnx-embedder"
  );
  const [vector] = await embedTexts(["export function hello() { return 1 }"]);
  return { dims: vector.length, ms: Date.now() - started };
}

async function dbProbe(): Promise<{ ms: number }> {
  "use step";
  const started = Date.now();
  const { db } = await import("@/lib/db");
  const { sql } = await import("drizzle-orm");
  await db.execute(sql`select 1`);
  return { ms: Date.now() - started };
}

async function flakyProbe(): Promise<{ attempts: number }> {
  "use step";
  const { attempt } = getStepMetadata();
  if (attempt < 2) {
    throw new RetryableError("spike: transient failure", { retryAfter: "5s" });
  }
  return { attempts: attempt };
}

// Size probe: pulls the real analysis pipeline into the flow function's
// bundle (what the migration would ship) without running it.
async function pipelineSizeProbe(): Promise<{ loaded: boolean }> {
  "use step";
  const pipeline = await import("@/lib/analysis/pipeline");
  return { loaded: typeof pipeline.runFullProjectAnalysis === "function" };
}

async function fatalProbe(): Promise<never> {
  "use step";
  throw new FatalError("spike: user error, no retry");
}

export async function spikeWorkflow(fatal: boolean) {
  "use workflow";
  const embed = await embedProbe();
  const database = await dbProbe();
  const flaky = await flakyProbe();
  const pipeline = await pipelineSizeProbe();
  if (fatal) await fatalProbe();
  return { embed, database, flaky, pipeline };
}
