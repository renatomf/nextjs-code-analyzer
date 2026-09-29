import { logger, requestIdFrom } from "@/shared/logger";

import { handleStripeEvent, verifyStripeWebhook } from "@/modules/billing/server";

export const runtime = "nodejs";

/**
 * Stripe → app sync of plan changes (upgrade, cancel, failed payment,
 * expiration). Only requests signed with STRIPE_WEBHOOK_SECRET are accepted.
 * Idempotent and order-safe (see handleStripeEvent).
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

  const event = await verifyStripeWebhook(payload, signature, secret);
  if (!event) {
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    await handleStripeEvent(event);
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
