import type Stripe from "stripe";

import type { PlanStatus } from "../../domain/plan";
import type { SubscriptionTerms } from "../../domain/subscription";

/**
 * Anticorruption layer: Stripe's subscription model translated into
 * billing's own terms. Stripe types stop here.
 */

export function planStatusFromStripe(status: Stripe.Subscription.Status): PlanStatus {
  if (status === "active" || status === "trialing") return "active";
  if (status === "past_due" || status === "unpaid") return "past_due";
  if (
    status === "canceled" ||
    status === "incomplete_expired" ||
    status === "paused"
  ) {
    return "canceled";
  }
  return "none";
}

export function subscriptionTermsFromStripe(
  subscription: Stripe.Subscription,
): SubscriptionTerms {
  return {
    priceId: subscription.items.data[0]?.price?.id ?? null,
    status: planStatusFromStripe(subscription.status),
  };
}
