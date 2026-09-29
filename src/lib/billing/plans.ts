import {
  getPlanCatalog,
  limitsFor,
  type PlanCatalog,
  type PlanId,
  type PlanLimits,
} from "@/modules/billing";

/**
 * Legacy entry point kept while callers migrate to `@/modules/billing`
 * (strangler, ADR-001). Same exports and behavior; plans and limits now live
 * in the module. The Stripe price label moves with the Stripe PR.
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

/**
 * Same as getPlans(), but premium.priceLabel comes from Stripe
 * (STRIPE_PRICE_PREMIUM) unless NEXT_PUBLIC_PLAN_PREMIUM_PRICE_LABEL is set.
 */
export async function getPlansWithStripePricing(): Promise<PlanCatalog> {
  const plans = getPlans();
  if (process.env.NEXT_PUBLIC_PLAN_PREMIUM_PRICE_LABEL?.trim()) {
    return plans;
  }

  const { fetchPremiumPriceLabel } = await import("@/lib/billing/stripe");
  const fromStripe = await fetchPremiumPriceLabel();
  if (fromStripe) {
    plans.premium.priceLabel = fromStripe;
  }
  return plans;
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
