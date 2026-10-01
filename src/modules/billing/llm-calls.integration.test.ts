import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";

import { llmCalls, projects } from "@/db/schema";
import { db } from "@/lib/db";
import { assertLlmBudget, recordLlmCall } from "@/modules/billing/server";
import { logger } from "@/shared/logger";
import { createUser, deleteUsers } from "@/test/integration/factories";

// LLM usage records on a real Postgres (roadmap Phase 4).

const created: string[] = [];

afterAll(async () => {
  await deleteUsers(created);
});

async function newUser() {
  const id = await createUser();
  created.push(id);
  return id;
}

const callsOf = (userId: string) => db.select().from(llmCalls).where(eq(llmCalls.userId, userId));

describe("recordLlmCall", () => {
  it("records the call's tokens, latency, outcome and estimated cost", async () => {
    const userId = await newUser();
    const [project] = await db
      .insert(projects)
      .values({ userId, name: "p", source: "upload", progressPercent: 0 })
      .returning({ id: projects.id });

    await recordLlmCall({
      userId,
      projectId: project.id,
      feature: "report",
      model: "openai/gpt-oss-120b",
      usage: { inputTokens: 5_500, outputTokens: 1_400 },
      latencyMs: 4_231.7,
      ok: true,
    });

    expect(await callsOf(userId)).toEqual([
      expect.objectContaining({
        projectId: project.id,
        feature: "report",
        model: "openai/gpt-oss-120b",
        inputTokens: 5_500,
        outputTokens: 1_400,
        latencyMs: 4_232,
        ok: true,
        costMicroUsd: 1_665,
      }),
    ]);
  });

  it("records a failed call with no tokens, and no cost for an unpriced model", async () => {
    const userId = await newUser();

    await recordLlmCall({
      userId,
      projectId: null,
      feature: "chat",
      model: "e2e-fake-model",
      usage: null,
      latencyMs: 120_000,
      ok: false,
    });

    expect(await callsOf(userId)).toEqual([
      expect.objectContaining({ inputTokens: 0, outputTokens: 0, ok: false, costMicroUsd: null }),
    ]);
  });

  it("keeps the user's spending when the project is deleted", async () => {
    const userId = await newUser();
    const [project] = await db
      .insert(projects)
      .values({ userId, name: "p", source: "upload", progressPercent: 0 })
      .returning({ id: projects.id });
    await recordLlmCall({
      userId,
      projectId: project.id,
      feature: "explain",
      model: "openai/gpt-oss-120b",
      usage: { inputTokens: 100, outputTokens: 50 },
      latencyMs: 900,
      ok: true,
    });

    await db.delete(projects).where(eq(projects.id, project.id));

    expect(await callsOf(userId)).toEqual([expect.objectContaining({ projectId: null, inputTokens: 100 })]);
  });

  it("never throws: a failure to record is logged instead", async () => {
    const error = vi.spyOn(logger, "error").mockImplementation(() => {});

    // A user that does not exist: the insert fails on the foreign key.
    await expect(
      recordLlmCall({
        userId: randomUUID(),
        projectId: null,
        feature: "chat",
        model: "openai/gpt-oss-120b",
        usage: { inputTokens: 1, outputTokens: 1 },
        latencyMs: 1,
        ok: true,
      }),
    ).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith("llm_usage.record_failed", expect.objectContaining({ feature: "chat" }));

    error.mockRestore();
  });
});

describe("assertLlmBudget", () => {
  afterAll(() => {
    delete process.env.PLAN_FREE_LLM_TOKENS_PER_DAY;
  });

  const row = (userId: string, tokens: number, createdAt?: Date) => ({
    userId,
    feature: "chat" as const,
    model: "openai/gpt-oss-120b",
    inputTokens: tokens,
    outputTokens: 0,
    latencyMs: 1,
    ok: true,
    ...(createdAt ? { createdAt } : {}),
  });

  it("counts only this user's tokens of today, failed calls included", async () => {
    process.env.PLAN_FREE_LLM_TOKENS_PER_DAY = "1000";
    const userId = await newUser();
    const other = await newUser();
    const yesterday = new Date(Date.now() - 36 * 60 * 60 * 1000);

    await db.insert(llmCalls).values([
      row(userId, 5_000, yesterday),
      row(other, 5_000),
      row(userId, 600),
      { ...row(userId, 300), outputTokens: 99, ok: false },
    ]);
    // 999 of 1000 today: one more call is allowed.
    await expect(assertLlmBudget(userId)).resolves.toBeUndefined();

    await db.insert(llmCalls).values(row(userId, 1));
    await expect(assertLlmBudget(userId)).rejects.toMatchObject({
      name: "BillingLimitError",
      code: "llm_tokens",
    });
  });
});
