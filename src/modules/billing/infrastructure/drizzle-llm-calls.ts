import { and, eq, gte, sql } from "drizzle-orm";

import { llmCalls, llmSwitches } from "@/db/schema";
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

/** Tokens (input + output) the user spent since `since`, failed calls included. */
export async function sumLlmTokensSince(userId: string, since: Date): Promise<number> {
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${llmCalls.inputTokens} + ${llmCalls.outputTokens}), 0)`.mapWith(Number),
    })
    .from(llmCalls)
    .where(and(eq(llmCalls.userId, userId), gte(llmCalls.createdAt, since)));
  return row?.total ?? 0;
}

/** The feature's kill switch: on unless a row turns it off. */
export async function isLlmFeatureEnabled(feature: LlmFeature): Promise<boolean> {
  const [row] = await db
    .select({ enabled: llmSwitches.enabled })
    .from(llmSwitches)
    .where(eq(llmSwitches.feature, feature))
    .limit(1);
  return row?.enabled ?? true;
}
