import type { planEnum } from "@/db/schema";

type Plan = (typeof planEnum.enumValues)[number];

export type PlanId = "free" | "premium";

export type PlanLimits = {
  analysesPerDay: number;
  chatPerHour: number;
  maxProjects: number;
  label: string;
  priceLabel: string;
  features: string[];
};

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function envText(name: string, fallback: string): string {
  const raw = process.env[name]?.trim();
  return raw || fallback;
}

/** Paid plan id stored in the DB / Stripe metadata. */
export const PAID_PLAN_ID: PlanId = "premium";

/**
 * Plan limits & copy. Override via env without code changes:
 * NEXT_PUBLIC_PLAN_PREMIUM_LABEL, NEXT_PUBLIC_PLAN_PREMIUM_PRICE_LABEL,
 * PLAN_FREE_ANALYSES_PER_DAY, PLAN_PREMIUM_ANALYSES_PER_DAY, etc.
 */
export function getPlans(): Record<PlanId, PlanLimits> {
  const premiumLabel = envText("NEXT_PUBLIC_PLAN_PREMIUM_LABEL", "Premium");
  const premiumPrice = envText(
    "NEXT_PUBLIC_PLAN_PREMIUM_PRICE_LABEL",
    "", // filled from Stripe when empty — see getPlansWithStripePricing()
  );
  const premiumAnalyses = envInt("PLAN_PREMIUM_ANALYSES_PER_DAY", 50);
  const premiumChat = envInt("PLAN_PREMIUM_CHAT_PER_HOUR", 200);
  const freeAnalyses = envInt("PLAN_FREE_ANALYSES_PER_DAY", 5);
  const freeChat = envInt("PLAN_FREE_CHAT_PER_HOUR", 20);
  const freeProjects = envInt("PLAN_FREE_MAX_PROJECTS", 5);

  return {
    free: {
      label: envText("NEXT_PUBLIC_PLAN_FREE_LABEL", "Free"),
      priceLabel: envText("NEXT_PUBLIC_PLAN_FREE_PRICE_LABEL", "$0"),
      analysesPerDay: freeAnalyses,
      chatPerHour: freeChat,
      maxProjects: freeProjects,
      features: [
        `${freeAnalyses} analyses / day`,
        `${freeProjects} projects`,
        `${freeChat} chat messages / hour`,
      ],
    },
    premium: {
      label: premiumLabel,
      priceLabel: premiumPrice || "See checkout",
      analysesPerDay: premiumAnalyses,
      chatPerHour: premiumChat,
      maxProjects: Number.POSITIVE_INFINITY,
      features: [
        `${premiumAnalyses} analyses / day`,
        "Unlimited projects",
        `${premiumChat} chat messages / hour`,
      ],
    },
  };
}

// TODO (Stripe step): getPlansWithStripePricing() from the original, once
// `@/lib/billing/stripe` exists.

export const PLANS = getPlans();

export function isPaidPlan(
  plan: Plan | PlanId | string | null | undefined,
  planStatus?: string | null,
): boolean {
  // Accept legacy "pro" rows if any remain before/during migration
  if (plan !== "premium" && plan !== "pro") return false;
  return planStatus === "active" || planStatus === "past_due";
}

export function effectivePlanId(
  plan: Plan | PlanId | string | null | undefined,
  planStatus?: string | null,
): PlanId {
  return isPaidPlan(plan, planStatus) ? "premium" : "free";
}

export function getPlanLimits(
  plan: Plan | PlanId | string | null | undefined,
  planStatus?: string | null,
): PlanLimits {
  return getPlans()[effectivePlanId(plan, planStatus)];
}

export function getPaidPlan(): PlanLimits {
  return getPlans().premium;
}
