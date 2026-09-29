/** Plans and what each one allows. Pure: the configuration comes from outside. */

export type PlanId = "free" | "premium";

/** Our own subscription states (Stripe's are translated at the boundary). */
export type PlanStatus = "none" | "active" | "past_due" | "canceled";

export type PlanLimits = {
  analysesPerDay: number;
  chatPerHour: number;
  maxProjects: number;
  label: string;
  priceLabel: string;
  features: string[];
};

export type PlanCatalog = Record<PlanId, PlanLimits>;

/** Tunable values (labels, prices, limits); read by infrastructure. */
export type PlanConfig = {
  free: {
    label: string;
    priceLabel: string;
    analysesPerDay: number;
    chatPerHour: number;
    maxProjects: number;
  };
  premium: {
    label: string;
    /** Empty when the price should come from Stripe. */
    priceLabel: string;
    analysesPerDay: number;
    chatPerHour: number;
  };
};

/** Paid plan id stored in the DB (plan enum) / Stripe metadata. */
export const PAID_PLAN_ID: PlanId = "premium";

export function buildPlanCatalog(config: PlanConfig): PlanCatalog {
  const { free, premium } = config;
  return {
    free: {
      label: free.label,
      priceLabel: free.priceLabel,
      analysesPerDay: free.analysesPerDay,
      chatPerHour: free.chatPerHour,
      maxProjects: free.maxProjects,
      features: [
        `${free.analysesPerDay} analyses / day`,
        `${free.maxProjects} projects`,
        `${free.chatPerHour} chat messages / hour`,
      ],
    },
    premium: {
      label: premium.label,
      priceLabel: premium.priceLabel || "See checkout",
      analysesPerDay: premium.analysesPerDay,
      chatPerHour: premium.chatPerHour,
      maxProjects: Number.POSITIVE_INFINITY,
      features: [
        `${premium.analysesPerDay} analyses / day`,
        "Unlimited projects",
        `${premium.chatPerHour} chat messages / hour`,
      ],
    },
  };
}

/**
 * Paid while `active` or `past_due` (grace period after a failed renewal —
 * product rule pinned by tests, TD-25).
 */
export function isPaidPlan(
  plan: string | null | undefined,
  planStatus?: string | null,
): boolean {
  if (plan !== "premium") return false;
  return planStatus === "active" || planStatus === "past_due";
}

export function effectivePlanId(
  plan: string | null | undefined,
  planStatus?: string | null,
): PlanId {
  return isPaidPlan(plan, planStatus) ? "premium" : "free";
}

export function limitsFor(
  catalog: PlanCatalog,
  plan: string | null | undefined,
  planStatus?: string | null,
): PlanLimits {
  return catalog[effectivePlanId(plan, planStatus)];
}
