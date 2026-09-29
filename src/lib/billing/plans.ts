import {
  getPlanCatalog,
  limitsFor,
  type PlanId,
  type PlanLimits,
} from "@/modules/billing";

/**
 * Legacy entry point kept while callers migrate to `@/modules/billing`
 * (strangler, ADR-001). Same exports and behavior; plans and limits now live
 * in the module. The Stripe price label is `getPlanCatalogWithPricing` in
 * `@/modules/billing/server`.
 */

export {
  PAID_PLAN_ID,
  effectivePlanId,
  isPaidPlan,
  type PlanId,
  type PlanLimits,
} from "@/modules/billing";

/**
 * Plan limits & copy. Override via env without code changes:
 * NEXT_PUBLIC_PLAN_PREMIUM_LABEL, NEXT_PUBLIC_PLAN_PREMIUM_PRICE_LABEL,
 * PLAN_FREE_ANALYSES_PER_DAY, PLAN_PREMIUM_ANALYSES_PER_DAY, etc.
 */
export function getPlans(): Record<PlanId, PlanLimits> {
  return getPlanCatalog();
}

export const PLANS = getPlans();

export function getPlanLimits(
  plan: string | null | undefined,
  planStatus?: string | null,
): PlanLimits {
  return limitsFor(getPlans(), plan, planStatus);
}

export function getPaidPlan(): PlanLimits {
  return getPlans().premium;
}
