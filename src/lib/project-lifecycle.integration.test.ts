import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { projects, usageEvents } from "@/db/schema";
import { db } from "@/lib/db";
import { getPlanCatalog } from "@/modules/billing";
import { createUser, deleteUsers } from "@/test/integration/factories";

// Characterization of the project lifecycle (queued → processing →
// completed/failed) before it moves into the projects module: the analyze
// claim, cancel and re-analyze, against a real Postgres. Only the session,
// Next's cache and the start of the analysis workflow are mocked (the
// workflow's stages have their own integration tests).

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  enqueueAnalysis: vi.fn(),
  analysisRunStatus: vi.fn(),
  assertRateLimit: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
// The limiter itself is covered elsewhere; here it is the step between the
// route's read and its claim, where the concurrency test holds requests.
vi.mock("@/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rate-limit")>()),
  assertRateLimit: mocks.assertRateLimit,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/analysis/analysis-job", () => ({
  enqueueAnalysis: mocks.enqueueAnalysis,
  analysisRunStatus: mocks.analysisRunStatus,
}));

import { POST as analyze } from "@/app/api/projects/[id]/analyze/route";
import { retryFullAnalysis } from "@/lib/actions/analysis";
import { failRunningAnalysis } from "@/modules/projects/server";
import { cancelAnalysis } from "@/lib/actions/projects";

type Status = "queued" | "processing" | "completed" | "failed";

const created: string[] = [];

afterAll(async () => {
  await deleteUsers(created);
});

beforeEach(() => {
  mocks.auth.mockReset();
  mocks.enqueueAnalysis.mockReset().mockResolvedValue("wrun_test");
  mocks.analysisRunStatus.mockReset().mockResolvedValue(null);
  mocks.assertRateLimit.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

async function signedInUser() {
  const id = await createUser();
  created.push(id);
  mocks.auth.mockResolvedValue({ user: { id } });
  return id;
}

async function createProject(
  userId: string,
  values: { status: Status; fileCount?: number; updatedAt?: Date; analysisRunId?: string },
) {
  const [project] = await db
    .insert(projects)
    .values({
      userId,
      name: "p",
      source: "upload",
      progressStep: "Seeded",
      progressPercent: 25,
      fileCount: 3,
      ...values,
    })
    .returning({ id: projects.id });
  return project.id;
}

async function readProject(projectId: string) {
  const [project] = await db
    .select({
      status: projects.status,
      progressStep: projects.progressStep,
      progressPercent: projects.progressPercent,
    })
    .from(projects)
    .where(eq(projects.id, projectId));
  return project;
}

const usageCount = (userId: string) =>
  db.$count(usageEvents, and(eq(usageEvents.userId, userId), eq(usageEvents.type, "analysis")));

function analyzeRequest(projectId: string) {
  return analyze(new Request("http://localhost/api", { method: "POST" }), {
    params: Promise.resolve({ id: projectId }),
  });
}

function projectForm(projectId: string) {
  const form = new FormData();
  form.set("projectId", projectId);
  return form;
}

const secondsAgo = (s: number) => new Date(Date.now() - s * 1000);

describe("POST /api/projects/[id]/analyze — claim", () => {
  it("claims a queued project and starts the analysis workflow once", async () => {
    const userId = await signedInUser();
    const projectId = await createProject(userId, { status: "queued" });

    const response = await analyzeRequest(projectId);

    expect(response.status).toBe(200);
    expect(mocks.enqueueAnalysis).toHaveBeenCalledExactlyOnceWith(userId, projectId);
    expect(await readProject(projectId)).toMatchObject({
      status: "processing",
      progressStep: "Starting analysis",
      progressPercent: 30,
    });
  });

  it("does not run a completed project again", async () => {
    const userId = await signedInUser();
    const projectId = await createProject(userId, { status: "completed" });

    expect(await (await analyzeRequest(projectId)).json()).toMatchObject({
      alreadyCompleted: true,
    });
    expect(mocks.enqueueAnalysis).not.toHaveBeenCalled();
  });

  it("does not start a second run while one is in flight", async () => {
    const userId = await signedInUser();
    const projectId = await createProject(userId, {
      status: "processing",
      updatedAt: secondsAgo(60),
    });

    expect(await (await analyzeRequest(projectId)).json()).toMatchObject({
      alreadyRunning: true,
    });
    expect(mocks.enqueueAnalysis).not.toHaveBeenCalled();
  });

  it("restarts a stale run (no update for more than 360 s)", async () => {
    const userId = await signedInUser();
    const projectId = await createProject(userId, {
      status: "processing",
      updatedAt: secondsAgo(400),
    });

    await analyzeRequest(projectId);

    expect(mocks.enqueueAnalysis).toHaveBeenCalledOnce();
  });

  it("retries a failed project that has files", async () => {
    const userId = await signedInUser();
    const projectId = await createProject(userId, { status: "failed", fileCount: 3 });

    await analyzeRequest(projectId);

    expect(mocks.enqueueAnalysis).toHaveBeenCalledOnce();
  });

  it("refuses a project whose import failed before any file was stored", async () => {
    const userId = await signedInUser();
    const projectId = await createProject(userId, { status: "failed", fileCount: 0 });

    const response = await analyzeRequest(projectId);

    expect(response.status).toBe(400);
    expect(mocks.enqueueAnalysis).not.toHaveBeenCalled();
    expect((await readProject(projectId)).status).toBe("failed");
  });

  it("answers 404 for another user's project and leaves it untouched", async () => {
    const owner = await signedInUser();
    const projectId = await createProject(owner, { status: "queued" });
    await signedInUser();

    const response = await analyzeRequest(projectId);

    expect(response.status).toBe(404);
    expect(mocks.enqueueAnalysis).not.toHaveBeenCalled();
    expect((await readProject(projectId)).status).toBe("queued");
  });

  it("records the run that owns the project", async () => {
    const userId = await signedInUser();
    const projectId = await createProject(userId, { status: "queued" });
    mocks.enqueueAnalysis.mockResolvedValueOnce("wrun_new");

    await analyzeRequest(projectId);

    const [row] = await db
      .select({ runId: projects.analysisRunId })
      .from(projects)
      .where(eq(projects.id, projectId));
    expect(row.runId).toBe("wrun_new");
  });

  it("does not start a second run while the workflow run is alive, even past the stale window", async () => {
    const userId = await signedInUser();
    const projectId = await createProject(userId, {
      status: "processing",
      updatedAt: secondsAgo(1_000),
      analysisRunId: "wrun_alive",
    });
    mocks.analysisRunStatus.mockResolvedValue("running");

    expect(await (await analyzeRequest(projectId)).json()).toMatchObject({ alreadyRunning: true });
    expect(mocks.analysisRunStatus).toHaveBeenCalledWith("wrun_alive");
    expect(mocks.enqueueAnalysis).not.toHaveBeenCalled();
  });

  it("restarts at once when the run ended but left the project processing", async () => {
    const userId = await signedInUser();
    const projectId = await createProject(userId, {
      status: "processing",
      updatedAt: secondsAgo(5),
      analysisRunId: "wrun_dead",
    });
    mocks.analysisRunStatus.mockResolvedValue("failed");

    await analyzeRequest(projectId);

    expect(mocks.enqueueAnalysis).toHaveBeenCalledOnce();
  });

  it("falls back to the stale window when the run's status cannot be read", async () => {
    const userId = await signedInUser();
    const projectId = await createProject(userId, {
      status: "processing",
      updatedAt: secondsAgo(60),
      analysisRunId: "wrun_unknown",
    });
    mocks.analysisRunStatus.mockResolvedValue(null);

    expect(await (await analyzeRequest(projectId)).json()).toMatchObject({ alreadyRunning: true });
    expect(mocks.enqueueAnalysis).not.toHaveBeenCalled();
  });

  it("lets only one of two requests restart the same dead run", async () => {
    const userId = await signedInUser();
    const projectId = await createProject(userId, {
      status: "processing",
      updatedAt: secondsAgo(5),
      analysisRunId: "wrun_dead",
    });
    mocks.analysisRunStatus.mockResolvedValue("failed");
    let arrived = 0;
    let releaseBoth!: () => void;
    const bothRead = new Promise<void>((resolve) => (releaseBoth = resolve));
    mocks.assertRateLimit.mockImplementation(async () => {
      arrived += 1;
      if (arrived === 2) releaseBoth();
      await bothRead;
    });

    const bodies = await Promise.all(
      [analyzeRequest(projectId), analyzeRequest(projectId)].map(async (r) => (await r).json()),
    );

    expect(mocks.enqueueAnalysis).toHaveBeenCalledOnce();
    expect(bodies.filter((b) => b.alreadyRunning)).toHaveLength(1);
  });

  it("lets only one of two parallel requests run the analysis", async () => {
    const userId = await signedInUser();
    const projectId = await createProject(userId, { status: "queued" });
    // Both requests read "queued" before either claims: only the atomic,
    // conditional UPDATE can stop the second one.
    let arrived = 0;
    let releaseBoth!: () => void;
    const bothRead = new Promise<void>((resolve) => (releaseBoth = resolve));
    mocks.assertRateLimit.mockImplementation(async () => {
      arrived += 1;
      if (arrived === 2) releaseBoth();
      await bothRead;
    });

    const bodies = await Promise.all(
      [analyzeRequest(projectId), analyzeRequest(projectId)].map(async (r) => (await r).json()),
    );

    expect(mocks.enqueueAnalysis).toHaveBeenCalledOnce();
    expect(bodies.filter((b) => b.alreadyRunning)).toHaveLength(1);
  });

  it("answers at once: the workflow runs the analysis, not the request", async () => {
    const userId = await signedInUser();
    const projectId = await createProject(userId, { status: "queued" });

    expect(await (await analyzeRequest(projectId)).json()).toEqual({
      ok: true,
      status: "processing",
      progressStep: "Starting analysis",
      progressPercent: 30,
    });
  });

  it("releases the claim and hides the error when the workflow cannot start", async () => {
    const userId = await signedInUser();
    const projectId = await createProject(userId, { status: "queued" });
    mocks.enqueueAnalysis.mockRejectedValueOnce(new Error("password=hunter2"));

    const response = await analyzeRequest(projectId);

    expect(response.status).toBe(500);
    const body = await response.text();
    expect(body).toContain("Analysis failed.");
    expect(body).not.toContain("hunter2");
    expect(await readProject(projectId)).toMatchObject({ status: "failed" });
    // Released now, not after the stale window: a retry starts it again.
    await analyzeRequest(projectId);
    expect(mocks.enqueueAnalysis).toHaveBeenCalledTimes(2);
  });
});

describe("failRunningAnalysis (end of a workflow run that died)", () => {
  it("fails a project that is still processing", async () => {
    const userId = await signedInUser();
    const projectId = await createProject(userId, { status: "processing" });

    expect(await failRunningAnalysis(userId, projectId, "Analysis failed. Please try again.")).toBe(true);
    expect((await readProject(projectId)).status).toBe("failed");
  });

  it("keeps the message a step already wrote", async () => {
    const userId = await signedInUser();
    const projectId = await createProject(userId, { status: "failed" });

    expect(await failRunningAnalysis(userId, projectId, "Analysis failed. Please try again.")).toBe(false);
  });

  it("does not touch another user's project", async () => {
    const owner = await signedInUser();
    const projectId = await createProject(owner, { status: "processing" });
    const intruder = await signedInUser();

    expect(await failRunningAnalysis(intruder, projectId, "x")).toBe(false);
    expect((await readProject(projectId)).status).toBe("processing");
  });
});

describe("cancelAnalysis", () => {
  it.each(["queued", "processing"] as const)(
    "deletes a %s project (nothing is kept)",
    async (status) => {
      const userId = await signedInUser();
      const projectId = await createProject(userId, { status });

      expect(await cancelAnalysis(projectId)).toEqual({ ok: true });
      expect(await readProject(projectId)).toBeUndefined();
    },
  );

  it.each(["completed", "failed"] as const)("does not delete a %s project", async (status) => {
    const userId = await signedInUser();
    const projectId = await createProject(userId, { status });

    expect(await cancelAnalysis(projectId)).toEqual({
      error: "This analysis is no longer running.",
    });
    expect((await readProject(projectId)).status).toBe(status);
  });

  it("does not delete another user's running project", async () => {
    const owner = await signedInUser();
    const projectId = await createProject(owner, { status: "processing" });
    await signedInUser();

    expect(await cancelAnalysis(projectId)).toEqual({
      error: "This analysis is no longer running.",
    });
    expect((await readProject(projectId)).status).toBe("processing");
  });
});

describe("retryFullAnalysis (uploaded project)", () => {
  it("queues a finished project again and consumes one analysis", async () => {
    const userId = await signedInUser();
    const projectId = await createProject(userId, { status: "completed" });

    // Success ends with a redirect to the progress page (thrown by Next).
    await expect(retryFullAnalysis({}, projectForm(projectId))).rejects.toMatchObject({
      digest: expect.stringContaining(`/projects/${projectId}/progress`),
    });

    expect(await readProject(projectId)).toMatchObject({
      status: "queued",
      progressStep: "Waiting to restart analysis",
    });
    expect(await usageCount(userId)).toBe(1);
  });

  it.each(["queued", "processing"] as const)(
    "refuses a %s project without consuming quota",
    async (status) => {
      const userId = await signedInUser();
      const projectId = await createProject(userId, { status });

      expect(await retryFullAnalysis({}, projectForm(projectId))).toEqual({
        error: "Analysis is already running for this project.",
      });
      expect((await readProject(projectId)).status).toBe(status);
      expect(await usageCount(userId)).toBe(0);
    },
  );

  it("refuses when the daily quota is used up, leaving the project as is", async () => {
    const userId = await signedInUser();
    const projectId = await createProject(userId, { status: "completed" });
    const { analysesPerDay } = getPlanCatalog().free;
    for (let i = 0; i < analysesPerDay; i += 1) {
      await db.insert(usageEvents).values({ userId, type: "analysis" });
    }

    const result = await retryFullAnalysis({}, projectForm(projectId));

    expect(result.error).toContain("Daily analysis limit reached");
    expect((await readProject(projectId)).status).toBe("completed");
    expect(await usageCount(userId)).toBe(analysesPerDay);
  });

  it("does not touch another user's project", async () => {
    const owner = await signedInUser();
    const projectId = await createProject(owner, { status: "completed" });
    await signedInUser();

    expect(await retryFullAnalysis({}, projectForm(projectId))).toEqual({
      error: "Project not found.",
    });
    expect((await readProject(projectId)).status).toBe("completed");
  });
});
