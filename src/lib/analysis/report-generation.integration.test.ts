import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { codeChunks, llmCalls, llmSwitches, projects, reports } from "@/db/schema";
import { db } from "@/lib/db";
import { persistProjectFiles } from "@/lib/files/storage";
import { analysisFixtureFiles } from "@/test/fixtures/analysis-project";
import { axisEmbedding, createUser, deleteUsers } from "@/test/integration/factories";

// Characterization of report generation before it moves into the analysis
// module: deterministic metrics + LLM review → category scores, health score,
// issue order and roadmap, stored on a real Postgres. The LLM is replaced by
// a fixed review; everything else is real.

const mocks = vi.hoisted(() => ({ runLlmHealthReview: vi.fn() }));

vi.mock("@/lib/analysis/report-llm", () => ({
  runLlmHealthReview: mocks.runLlmHealthReview,
}));

import { generateProjectReport } from "@/lib/analysis/report";

const LLM_REVIEW = {
  architectureSummary: "Layers are mixed.",
  securitySummary: "Input is validated.",
  performanceSummary: "No hot spots.",
  issues: [
    {
      title: "Business logic in route handlers",
      description: "Handlers query the database directly.",
      severity: "high" as const,
      category: "architecture" as const,
      filePath: "src/app/page.tsx",
    },
    {
      title: "Missing rate limit",
      description: "Login has no brute-force protection.",
      severity: "medium" as const,
      category: "security" as const,
      filePath: null,
    },
    {
      title: "N+1 query",
      description: "A query runs per item.",
      severity: "low" as const,
      category: "performance" as const,
      filePath: "src/payment.ts",
    },
  ],
  usage: { inputTokens: 5_500, outputTokens: 1_400 },
};

const llmCallsOf = (projectId: string) =>
  db
    .select({ feature: llmCalls.feature, ok: llmCalls.ok, inputTokens: llmCalls.inputTokens, outputTokens: llmCalls.outputTokens })
    .from(llmCalls)
    .where(eq(llmCalls.projectId, projectId));

const created: string[] = [];
let owner: string;

beforeAll(async () => {
  owner = await createUser();
  created.push(owner);
});

afterAll(async () => {
  await deleteUsers(created);
});

beforeEach(() => {
  mocks.runLlmHealthReview.mockReset().mockResolvedValue(LLM_REVIEW);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

async function analyzedProject(chunkCount = 3) {
  const [project] = await db
    .insert(projects)
    .values({
      userId: owner,
      name: "fixture",
      framework: "nextjs",
      source: "upload",
      status: "processing",
      progressPercent: 80,
    })
    .returning({ id: projects.id });
  await persistProjectFiles(
    owner,
    project.id,
    analysisFixtureFiles().map((file) => ({ ...file, sizeBytes: file.content.length })),
  );
  for (let i = 0; i < chunkCount; i += 1) {
    await db.insert(codeChunks).values({
      projectId: project.id,
      // Zero-padded so the alphabetical order is predictable.
      filePath: `src/chunk-${String(i).padStart(3, "0")}.ts`,
      content: `chunk ${i}`,
      startLine: 1,
      endLine: 1,
      embedding: axisEmbedding(i % 384),
    });
  }
  return project.id;
}

async function projectState(projectId: string) {
  const [row] = await db
    .select({ status: projects.status, errorMessage: projects.errorMessage })
    .from(projects)
    .where(eq(projects.id, projectId));
  return row;
}

describe("generateProjectReport (characterization)", () => {
  it("scores the project and stores the report", async () => {
    const projectId = await analyzedProject();

    const report = await generateProjectReport(owner, projectId);

    // Today's formula, pinned (Phase 7 changes it on purpose).
    expect({ healthScore: report.healthScore, categoryScores: report.categoryScores }).toMatchSnapshot();
    expect(report.issues.map((issue) => `${issue.severity} ${issue.category} ${issue.title}`)).toMatchSnapshot();
    expect(report.roadmap).toEqual(report.issues.slice(0, 10));
    expect(report.categorySummaries).toMatchSnapshot();

    const [stored] = await db.select().from(reports).where(eq(reports.projectId, projectId));
    expect(stored.healthScore).toBe(report.healthScore);
    expect(stored.issues).toEqual(report.issues);
    expect(stored.categoryScores).toEqual({
      ...report.categoryScores,
      summaries: report.categorySummaries,
    });
    expect(await projectState(projectId)).toEqual({ status: "completed", errorMessage: null });
  });

  it("gives the LLM review every chunk, in file-path order (it samples them)", async () => {
    const projectId = await analyzedProject(85);

    await generateProjectReport(owner, projectId);

    const [{ projectName, framework, chunks }] = mocks.runLlmHealthReview.mock.calls[0];
    expect({ projectName, framework }).toEqual({ projectName: "fixture", framework: "nextjs" });
    expect(chunks).toHaveLength(85);
    expect(chunks[0].filePath).toBe("src/chunk-000.ts");
    expect(chunks[84].filePath).toBe("src/chunk-084.ts");
  });

  it("fails with a user-facing message when there is no code knowledge", async () => {
    const projectId = await analyzedProject(0);

    await expect(generateProjectReport(owner, projectId)).rejects.toThrow(
      "No code chunks available. Build project knowledge before generating a report.",
    );
    expect(await projectState(projectId)).toEqual({
      status: "failed",
      errorMessage: "No code chunks available. Build project knowledge before generating a report.",
    });
    expect(mocks.runLlmHealthReview).not.toHaveBeenCalled();
  });

  it("hides an LLM failure behind a generic message and stores no report", async () => {
    const projectId = await analyzedProject();
    mocks.runLlmHealthReview.mockRejectedValue(new Error("provider 500: key=gsk_hunter2"));

    await expect(generateProjectReport(owner, projectId)).rejects.toThrow();

    expect(await projectState(projectId)).toEqual({
      status: "failed",
      errorMessage: "Failed to generate health report.",
    });
    expect(await db.select().from(reports).where(eq(reports.projectId, projectId))).toEqual([]);
    // The failed call is recorded too (Phase 4): latency, no tokens.
    expect(await llmCallsOf(projectId)).toEqual([
      { feature: "report", ok: false, inputTokens: 0, outputTokens: 0 },
    ]);
  });

  it("records the LLM call's usage with the report", async () => {
    const projectId = await analyzedProject();

    await generateProjectReport(owner, projectId);

    expect(await llmCallsOf(projectId)).toEqual([
      { feature: "report", ok: true, inputTokens: 5_500, outputTokens: 1_400 },
    ]);
  });

  it("refuses before calling the LLM once the daily token budget is spent", async () => {
    process.env.PLAN_FREE_LLM_TOKENS_PER_DAY = "1000";
    try {
      const projectId = await analyzedProject();
      await db.insert(llmCalls).values({
        userId: owner,
        feature: "chat",
        model: "openai/gpt-oss-120b",
        inputTokens: 1_000,
        outputTokens: 0,
        latencyMs: 1,
        ok: true,
      });

      await expect(generateProjectReport(owner, projectId)).rejects.toMatchObject({ code: "llm_tokens" });
      expect(mocks.runLlmHealthReview).not.toHaveBeenCalled();
      // A plan limit, so the user sees why (DomainError message).
      expect(await projectState(projectId)).toEqual({
        status: "failed",
        errorMessage: expect.stringContaining("Daily AI usage limit reached"),
      });
    } finally {
      delete process.env.PLAN_FREE_LLM_TOKENS_PER_DAY;
    }
  });

  it("refuses before calling the LLM while the report's kill switch is off", async () => {
    await db.insert(llmSwitches).values({ feature: "report", enabled: false });
    try {
      const projectId = await analyzedProject();

      await expect(generateProjectReport(owner, projectId)).rejects.toMatchObject({
        name: "LlmUnavailableError",
      });
      expect(mocks.runLlmHealthReview).not.toHaveBeenCalled();
      expect(await projectState(projectId)).toEqual({
        status: "failed",
        errorMessage: "The AI review is temporarily unavailable. Try again later.",
      });
    } finally {
      await db.delete(llmSwitches).where(eq(llmSwitches.feature, "report"));
    }
  });

  it("never reports on another user's project", async () => {
    const projectId = await analyzedProject();
    const intruder = await createUser();
    created.push(intruder);

    await expect(generateProjectReport(intruder, projectId)).rejects.toThrow("Project not found");
    expect(mocks.runLlmHealthReview).not.toHaveBeenCalled();
    expect(await projectState(projectId)).toEqual({ status: "processing", errorMessage: null });
  });
});
