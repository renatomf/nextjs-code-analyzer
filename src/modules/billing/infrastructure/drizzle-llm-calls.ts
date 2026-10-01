import { llmCalls } from "@/db/schema";
import { db } from "@/lib/db";

import type { LlmFeature } from "../domain/llm-cost";

export type LlmCallRow = {
  userId: string;
  projectId: string | null;
  feature: LlmFeature;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  ok: boolean;
  costMicroUsd: number | null;
};

export async function insertLlmCall(row: LlmCallRow): Promise<void> {
  await db.insert(llmCalls).values(row);
}
