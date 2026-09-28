import { beforeEach, describe, expect, it, vi } from "vitest";

const { selectUser, findFirst, countProject, countUsage, insertValues, insert } =
  vi.hoisted(() => {
    const insertValues = vi.fn();
    return {
      selectUser: vi.fn(),
      findFirst: vi.fn(),
      countProject: vi.fn(),
      countUsage: vi.fn(),
      insertValues,
      insert: vi.fn(() => ({ values: insertValues })),
    };
  });

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db", async () => {
  const { projects } = await import("@/db/schema");
  return {
    db: {
      select: () => ({
        from: () => ({ where: () => ({ for: selectUser }) }),
      }),
      $count: (table: unknown) =>
        table === projects ? countProject() : countUsage(),
      insert,
      query: { users: { findFirst } },
    },
  };
});

import { usageEvents } from "@/db/schema";
import {
  assertCanCreateProject,
  assertCanRunAnalysis,
  BillingLimitError,
  getBillingSnapshot,
  recordAnalysisUsage,
} from "@/lib/billing/entitlements";

describe("entitlements", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.PLAN_FREE_ANALYSES_PER_DAY;
    delete process.env.PLAN_FREE_MAX_PROJECTS;
  });

  it("recordAnalysisUsage creates an analysis usage event", async () => {
    insertValues.mockResolvedValue(undefined);
    await recordAnalysisUsage("user-1");
    expect(insert).toHaveBeenCalledWith(usageEvents);
    expect(insertValues).toHaveBeenCalledWith({
      userId: "user-1",
      type: "analysis",
    });
  });

  it("assertCanRunAnalysis allows when under daily limit", async () => {
    selectUser.mockResolvedValue([{ plan: "free", planStatus: "none" }]);
    countUsage.mockResolvedValue(2);
    await expect(assertCanRunAnalysis("user-1")).resolves.toBeUndefined();
  });

  it("assertCanRunAnalysis throws BillingLimitError at daily cap", async () => {
    selectUser.mockResolvedValue([{ plan: "free", planStatus: "none" }]);
    countUsage.mockResolvedValue(5);

    await expect(assertCanRunAnalysis("user-1")).rejects.toMatchObject({
      name: "BillingLimitError",
      code: "analyses",
    });
  });

  it("assertCanCreateProject throws when project cap reached", async () => {
    selectUser.mockResolvedValue([{ plan: "free", planStatus: "none" }]);
    countProject.mockResolvedValue(5);

    await expect(assertCanCreateProject("user-1")).rejects.toBeInstanceOf(
      BillingLimitError,
    );
    await expect(assertCanCreateProject("user-1")).rejects.toMatchObject({
      code: "projects",
    });
  });

  it("assertCanCreateProject checks analysis limit after project count", async () => {
    selectUser.mockResolvedValue([{ plan: "free", planStatus: "none" }]);
    countProject.mockResolvedValue(1);
    countUsage.mockResolvedValue(5);

    await expect(assertCanCreateProject("user-1")).rejects.toMatchObject({
      code: "analyses",
    });
  });

  it("throws when the user does not exist", async () => {
    selectUser.mockResolvedValue([]);
    await expect(assertCanRunAnalysis("user-1")).rejects.toThrow(
      "User not found.",
    );
  });

  it("getBillingSnapshot returns usage and limits", async () => {
    findFirst.mockResolvedValue({
      plan: "premium",
      planStatus: "active",
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
    });
    countUsage.mockResolvedValue(3);
    countProject.mockResolvedValue(7);

    const snap = await getBillingSnapshot("user-1");
    expect(snap.analysesUsedToday).toBe(3);
    expect(snap.projectCount).toBe(7);
    expect(snap.hasStripeCustomer).toBe(true);
    expect(snap.hasSubscription).toBe(true);
    expect(snap.limits.analysesPerDay).toBe(50);
  });
});
