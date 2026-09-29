import type Stripe from "stripe";

import { getStripe } from "./client";
import {
  handleCheckoutSessionCompleted,
  syncSubscriptionFromStripe,
} from "./webhook-handlers";

const SUBSCRIPTION_EVENTS = new Set<Stripe.Event.Type>([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

/**
 * The event, or null when `signature` does not match the exact raw
 * `payload` signed with `secret`.
 */
export function verifyStripeWebhook(
  payload: string,
  signature: string,
  secret: string,
): Stripe.Event | null {
  const stripe = getStripe();
  try {
    return stripe.webhooks.constructEvent(payload, signature, secret);
  } catch {
    return null;
  }
}

/**
 * Idempotent and order-safe without an events table: for subscription events
 * the current subscription is fetched from Stripe and its full state is
 * written, so retries, duplicates and out-of-order deliveries converge on the
 * real state.
 */
export async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  if (event.type === "checkout.session.completed") {
    await handleCheckoutSessionCompleted(event.data.object);
  } else if (SUBSCRIPTION_EVENTS.has(event.type)) {
    const { id } = event.data.object as Stripe.Subscription;
    const subscription = await getStripe().subscriptions.retrieve(id);
    await syncSubscriptionFromStripe(subscription);
  }
}
