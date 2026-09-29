import { logger, requestIdFrom } from "@/shared/logger";
import type Stripe from "stripe";

import { getStripe } from "@/lib/billing/stripe";
import {
  handleCheckoutSessionCompleted,
  syncSubscriptionFromStripe,
} from "@/lib/billing/webhook-handlers";

export const runtime = "nodejs";

const SUBSCRIPTION_EVENTS = new Set<Stripe.Event.Type>([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

/**
 * Stripe → app sync of plan changes (upgrade, cancel, failed payment,
 * expiration). Only requests signed with STRIPE_WEBHOOK_SECRET are accepted.
 *
 * Idempotent and order-safe without an events table: for subscription events
 * the current subscription is fetched from Stripe and its full state is
 * written, so retries, duplicates and out-of-order deliveries converge on the
 * real state.
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    logger.error("stripe.webhook_not_configured");
    return Response.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  // The signature covers the exact raw body: read it as text, never as JSON.
  const payload = await request.text();
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, secret);
  } catch {
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      await handleCheckoutSessionCompleted(event.data.object);
    } else if (SUBSCRIPTION_EVENTS.has(event.type)) {
      const { id } = event.data.object as Stripe.Subscription;
      const subscription = await stripe.subscriptions.retrieve(id);
      await syncSubscriptionFromStripe(subscription);
    }
  } catch (error) {
    // Non-2xx makes Stripe retry the delivery later.
    logger.error("stripe.webhook_failed", {
      err: error,
      eventId: event.id,
      type: event.type,
      requestId: requestIdFrom(request.headers),
    });
    return Response.json({ error: "Webhook handler failed" }, { status: 500 });
  }

  return Response.json({ received: true });
}
