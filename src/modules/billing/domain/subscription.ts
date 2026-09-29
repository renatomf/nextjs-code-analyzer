import type { PlanId, PlanStatus } from "./plan";

/** A subscription from the payment provider, already in our own terms. */
export type SubscriptionTerms = {
  priceId: string | null;
  status: PlanStatus;
};

export type Entitlement = {
  plan: PlanId;
  planStatus: PlanStatus;
  /** Price the user is subscribed to, kept even when it grants nothing. */
  priceId: string | null;
};

/**
 * What a subscription gives the user. `premiumPriceId` is null when the
 * premium price is not configured.
 *
 * - Only the configured premium price grants premium: an unknown price never
 *   does.
 * - TD-25: a failed renewal (past_due) keeps the plan as a grace period;
 *   canceled or none fall back to free.
 */
export function entitlementFor(
  subscription: SubscriptionTerms,
  premiumPriceId: string | null,
): Entitlement {
  const priceId = subscription.priceId || null;
  const pricePlan: PlanId =
    priceId && priceId === premiumPriceId ? "premium" : "free";
  const planStatus = subscription.status;
  const plan =
    planStatus === "active" || planStatus === "past_due" ? pricePlan : "free";

  return { plan, planStatus, priceId };
}
