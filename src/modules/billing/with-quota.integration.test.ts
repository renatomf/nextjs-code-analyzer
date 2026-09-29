import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";

import { projects, usageEvents } from "@/db/schema";
import { db } from "@/lib/db";
import { BillingLimitError, getPlanCatalog } from "@/modules/billing";
import { refundAnalysisUsage, withQuota } from "@/modules/billing/server";
import { createUser, deleteUsers } from "@/test/integration/factories";

// withQuota on a real Postgres: lock + check + work + usage in one
// transaction, all-or-nothing.

const created: string[] = [];

afterAll(async () => {
  await deleteUsers(created);
});

async function newUser() {
  const id = await createUser();
  created.push(id);
  return id;
}

const insertProject = (tx: Parameters<Parameters<typeof db.transaction>[0]>[0], userId: string) =>
  tx
    .insert(projects)
    .values({ userId, name: "p", source: "upload", progressPercent: 0 })
    .returning({ id: projects.id });

const projectCount = (userId: string) => db.$count(projects, eq(projects.userId, userId));
const usageCount = (userId: string) =>
  db.$count(usageEvents, and(eq(usageEvents.userId, userId), eq(usageEvents.type, "analysis")));

describe("withQuota", () => {
  it("keeps the work and records usage when the quota is consumed", async () => {
    const userId = await newUser();

    const projectId = await withQuota(userId, "project", async (tx) => {
      const [project] = await insertProject(tx, userId);
      return { consumed: true, value: project.id };
    });

    expect(projectId).toEqual(expect.any(String));
    expect(await projectCount(userId)).toBe(1);
    expect(await usageCount(userId)).toBe(1);
  });

  it("does not record usage when the work reports nothing consumed", async () => {
    const userId = await newUser();

    const value = await withQuota(userId, "analysis", async () => ({ consumed: false, value: "skipped" }));

    expect(value).toBe("skipped");
    expect(await usageCount(userId)).toBe(0);
  });

  it("rolls back the work and the usage when the work throws", async () => {
    const userId = await newUser();

    await expect(
      withQuota(userId, "project", async (tx) => {
        await insertProject(tx, userId);
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(await projectCount(userId)).toBe(0);
    expect(await usageCount(userId)).toBe(0);
  });

  it("does not run the work when the plan limit is reached", async () => {
    const userId = await newUser();
    const { maxProjects } = getPlanCatalog().free;
    for (let i = 0; i < maxProjects; i += 1) {
      await db.insert(projects).values({ userId, name: `p${i}`, source: "upload", progressPercent: 0 });
    }
    const work = vi.fn();

    await expect(withQuota(userId, "project", work)).rejects.toBeInstanceOf(BillingLimitError);
    expect(work).not.toHaveBeenCalled();
    expect(await usageCount(userId)).toBe(0);
  });

  it("lets only one of two parallel requests take the last project slot", async () => {
    const userId = await newUser();
    const { maxProjects } = getPlanCatalog().free;
    for (let i = 0; i < maxProjects - 1; i += 1) {
      await db.insert(projects).values({ userId, name: `p${i}`, source: "upload", progressPercent: 0 });
    }
    const takeSlot = () =>
      withQuota(userId, "project", async (tx) => {
        const [project] = await insertProject(tx, userId);
        return { consumed: true, value: project.id };
      });

    const results = await Promise.allSettled([takeSlot(), takeSlot()]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(rejected?.reason).toBeInstanceOf(BillingLimitError);
    expect(await projectCount(userId)).toBe(maxProjects);
    expect(await usageCount(userId)).toBe(1);
  });

  it("refunds exactly the usage it recorded, and only for its owner", async () => {
    const userId = await newUser();
    const otherUser = await newUser();
    const usageId = await withQuota(userId, "analysis", async (_tx, usage) => ({
      consumed: true,
      value: usage.id,
    }));

    await refundAnalysisUsage(otherUser, usageId);
    expect(await usageCount(userId)).toBe(1);

    await refundAnalysisUsage(userId, usageId);
    expect(await usageCount(userId)).toBe(0);
  });
});
