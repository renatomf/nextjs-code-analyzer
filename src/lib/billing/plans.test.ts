import {
  effectivePlanId,
  getPlanLimits,
  getPlans,
  isPaidPlan,
} from "@/lib/billing/plans";
import { afterEach, describe, expect, it } from "vitest";

describe("getPlans", () => {
  afterEach(() => {
    delete process.env.PLAN_FREE_ANALYSES_PER_DAY;
    delete process.env.PLAN_PREMIUM_ANALYSES_PER_DAY;
    delete process.env.PLAN_FREE_MAX_PROJECTS;
    delete process.env.NEXT_PUBLIC_PLAN_PREMIUM_LABEL;
  });

  it("returns Free and Premium defaults", () => {
    const plans = getPlans();
    expect(plans.free.analysesPerDay).toBe(5);
    expect(plans.free.maxProjects).toBe(5);
    expect(plans.premium.analysesPerDay).toBe(50);
    expect(plans.premium.maxProjects).toBe(Number.POSITIVE_INFINITY);
    expect(plans.premium.label).toBe("Premium");
  });

  it("respects env overrides", () => {
    process.env.PLAN_FREE_ANALYSES_PER_DAY = "3";
    process.env.PLAN_PREMIUM_ANALYSES_PER_DAY = "100";
    process.env.PLAN_FREE_MAX_PROJECTS = "2";
    process.env.NEXT_PUBLIC_PLAN_PREMIUM_LABEL = "Pro Plus";

    const plans = getPlans();
    expect(plans.free.analysesPerDay).toBe(3);
    expect(plans.premium.analysesPerDay).toBe(100);
    expect(plans.free.maxProjects).toBe(2);
    expect(plans.premium.label).toBe("Pro Plus");
  });
});

describe("isPaidPlan / effectivePlanId", () => {
  it("treats active premium as paid", () => {
    expect(isPaidPlan("premium", "active")).toBe(true);
    expect(isPaidPlan("premium", "past_due")).toBe(true);
    expect(effectivePlanId("premium", "active")).toBe("premium");
  });

  it("treats canceled or free as free", () => {
    expect(isPaidPlan("premium", "canceled")).toBe(false);
    expect(isPaidPlan("free", "active")).toBe(false);
    expect(effectivePlanId("premium", "canceled")).toBe("free");
    expect(effectivePlanId("free", null)).toBe("free");
  });

  it("accepts legacy pro plan id", () => {
    expect(isPaidPlan("pro", "active")).toBe(true);
    expect(effectivePlanId("pro", "active")).toBe("premium");
  });
});

describe("getPlanLimits", () => {
  it("returns free limits for unpaid users", () => {
    const limits = getPlanLimits("free", "none");
    expect(limits.analysesPerDay).toBe(5);
  });

  it("returns premium limits for active paid users", () => {
    const limits = getPlanLimits("premium", "active");
    expect(limits.analysesPerDay).toBe(50);
    expect(limits.maxProjects).toBe(Number.POSITIVE_INFINITY);
  });
});
