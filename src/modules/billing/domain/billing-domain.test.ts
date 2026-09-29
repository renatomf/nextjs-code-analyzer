import { describe, expect, it } from "vitest";

import {
  buildPlanCatalog,
  effectivePlanId,
  isPaidPlan,
  limitsFor,
  type PlanConfig,
} from "./plan";
import {
  assertAnalysisQuota,
  assertProjectQuota,
  BillingLimitError,
  quotaDayStart,
} from "./quota";

// Pure domain rules: no database, no environment variables.

const config: PlanConfig = {
  free: { label: "Free", priceLabel: "$0", analysesPerDay: 5, chatPerHour: 20, maxProjects: 3 },
  premium: { label: "Premium", priceLabel: "", analysesPerDay: 50, chatPerHour: 200 },
};
const catalog = buildPlanCatalog(config);

describe("plan catalog", () => {
  it("gives premium unlimited projects and a fallback price label", () => {
    expect(catalog.premium.maxProjects).toBe(Number.POSITIVE_INFINITY);
    expect(catalog.premium.priceLabel).toBe("See checkout");
    expect(catalog.free.features).toEqual([
      "5 analyses / day",
      "3 projects",
      "20 chat messages / hour",
    ]);
  });
});

describe("entitlement", () => {
  it.each([
    ["premium", "active", true],
    ["premium", "past_due", true], // grace period (TD-25)
    ["premium", "canceled", false],
    ["premium", "none", false],
    ["free", "active", false],
    ["pro", "active", true], // legacy rows
  ] as const)("%s + %s is paid: %s", (plan, status, paid) => {
    expect(isPaidPlan(plan, status)).toBe(paid);
    expect(effectivePlanId(plan, status)).toBe(paid ? "premium" : "free");
  });

  it("picks the limits of the effective plan", () => {
    expect(limitsFor(catalog, "premium", "canceled")).toBe(catalog.free);
    expect(limitsFor(catalog, "premium", "past_due")).toBe(catalog.premium);
  });
});

describe("quota", () => {
  it("starts the quota day at 00:00 UTC", () => {
    expect(quotaDayStart(new Date("2026-03-10T23:59:59Z")).toISOString()).toBe(
      "2026-03-10T00:00:00.000Z",
    );
    expect(quotaDayStart(new Date("2026-03-11T00:00:01Z")).toISOString()).toBe(
      "2026-03-11T00:00:00.000Z",
    );
  });

  it("blocks a new project at the plan limit, with an upgrade notice", () => {
    expect(() => assertProjectQuota(catalog, catalog.free, 2)).not.toThrow();

    try {
      assertProjectQuota(catalog, catalog.free, 3);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(BillingLimitError);
      expect(error).toMatchObject({ code: "projects", canUpgrade: true, title: "Project limit reached" });
    }
  });

  it("blocks analyses at the daily limit; premium users get no upgrade offer", () => {
    expect(() => assertAnalysisQuota(catalog, catalog.free, 4)).not.toThrow();
    expect(() => assertAnalysisQuota(catalog, catalog.free, 5)).toThrow(BillingLimitError);

    try {
      assertAnalysisQuota(catalog, catalog.premium, 50);
      expect.unreachable();
    } catch (error) {
      expect(error).toMatchObject({ code: "analyses", canUpgrade: false });
      expect((error as Error).message).toContain("Try again tomorrow.");
    }
  });
});
