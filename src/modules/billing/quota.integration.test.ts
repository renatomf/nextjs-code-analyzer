import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { projects, usageEvents } from "@/db/schema";
import { db } from "@/lib/db";
import { BillingLimitError, getPlanCatalog } from "@/modules/billing";
import { billingFor } from "@/modules/billing/server";
import { createUser, deleteUsers } from "@/test/integration/factories";

const created: string[] = [];

afterAll(async () => {
  await deleteUsers(created);
});

/** Same shape as project creation in actions/github.ts: check, then insert. */
function createProjectUnderLimit(userId: string, name: string) {
  return db.transaction(async (tx) => {
    await billingFor(tx).assertCanCreateProject(userId);
    await tx.insert(projects).values({
      userId,
      name,
      source: "upload",
      progressPercent: 0,
    });
  });
}

describe("project limit under concurrency", () => {
  let userId: string;
  const { maxProjects } = getPlanCatalog().free;

  beforeAll(async () => {
    userId = await createUser();
    created.push(userId);
    // Leave exactly one free slot.
    for (let i = 0; i < maxProjects - 1; i += 1) {
      await createProjectUnderLimit(userId, `existing-${i}`);
    }
  });

  it("lets only one of two parallel requests take the last slot", async () => {
    const results = await Promise.allSettled([
      createProjectUnderLimit(userId, "parallel-a"),
      createProjectUnderLimit(userId, "parallel-b"),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter(
      (r): r is PromiseRejectedResult => r.status === "rejected",
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(BillingLimitError);

    expect(await db.$count(projects, eq(projects.userId, userId))).toBe(maxProjects);
  });
});

// TD-25: the daily analysis quota resets at 00:00 UTC (not the user's local
// midnight, not a rolling 24h window).
describe("daily analysis quota", () => {
  const { analysesPerDay } = getPlanCatalog().free;

  afterEach(() => {
    vi.useRealTimers();
  });

  async function seedUsage(userId: string, createdAt: Date, n: number) {
    for (let i = 0; i < n; i += 1) {
      await db.insert(usageEvents).values({ userId, type: "analysis", createdAt });
    }
  }

  it("counts only today's analyses, from midnight UTC", async () => {
    const userId = await createUser();
    created.push(userId);

    // Fake only Date (the pg driver needs real timers).
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-03-10T02:00:00Z"));

    // Yesterday 23:59 UTC is only 2h ago, but belongs to the previous day.
    await seedUsage(userId, new Date("2026-03-09T23:59:00Z"), analysesPerDay);
    await seedUsage(userId, new Date("2026-03-10T00:01:00Z"), analysesPerDay - 1);

    await expect(billingFor().assertCanRunAnalysis(userId)).resolves.toBeUndefined();

    await seedUsage(userId, new Date("2026-03-10T01:00:00Z"), 1);
    await expect(billingFor().assertCanRunAnalysis(userId)).rejects.toBeInstanceOf(BillingLimitError);
  });
});
