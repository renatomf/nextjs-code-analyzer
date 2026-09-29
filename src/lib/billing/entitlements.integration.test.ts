import { count, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { codeChunks, projectFiles, projects, reports } from "@/db/schema";
import {
  assertCanCreateProject,
  BillingLimitError,
} from "@/lib/billing/entitlements";
import { getPlanLimits } from "@/lib/billing/plans";
import { db } from "@/lib/db";
import {
  createProjectWithData,
  createUser,
  deleteUsers,
} from "@/test/integration/factories";

const created: string[] = [];

afterAll(async () => {
  await deleteUsers(created);
});

/** Same shape as project creation in actions/github.ts: check, then insert. */
function createProjectUnderLimit(userId: string, name: string) {
  return db.transaction(async (tx) => {
    await assertCanCreateProject(userId, tx);
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
  const { maxProjects } = getPlanLimits("free", "none");

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

describe("deleting a project", () => {
  it("removes its files, chunks and report (no private code left behind)", async () => {
    const userId = await createUser();
    created.push(userId);
    const projectId = await createProjectWithData(userId, "to-delete");

    await db.delete(projects).where(eq(projects.id, projectId));

    for (const table of [projectFiles, codeChunks, reports]) {
      const [row] = await db
        .select({ n: count() })
        .from(table)
        .where(eq(table.projectId, projectId));
      expect(row.n).toBe(0);
    }
  });
});
