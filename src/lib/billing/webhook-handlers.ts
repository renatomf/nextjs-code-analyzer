import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { z } from "zod";

import { users } from "@/db/schema";
import { getPremiumPriceId } from "@/lib/billing/stripe";
import { db } from "@/lib/db";

const userIdSchema = z.uuid();

function planFromPriceId(priceId: string | null | undefined) {
  if (!priceId) return { plan: "free" as const, stripePriceId: null };
  try {
    if (priceId === getPremiumPriceId()) {
      return { plan: "premium" as const, stripePriceId: priceId };
    }
  } catch {
    // Price env missing in some contexts — fall through
  }

  // Unknown price: never grant premium for a price we did not configure.
  return { plan: "free" as const, stripePriceId: priceId };
}

function statusFromStripe(
  status: Stripe.Subscription.Status,
): "active" | "past_due" | "canceled" | "none" {
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

async function findUserIdForSubscription(
  subscription: Stripe.Subscription,
): Promise<string | null> {
  const fromMeta = userIdSchema.safeParse(subscription.metadata?.userId);
  if (fromMeta.success) return fromMeta.data;

  if (typeof subscription.customer === "string") {
    const user = await db.query.users.findFirst({
      where: eq(users.stripeCustomerId, subscription.customer),
      columns: { id: true },
    });
    return user?.id ?? null;
  }

  return null;
}

export async function syncSubscriptionFromStripe(
  subscription: Stripe.Subscription,
): Promise<void> {
  const userId = await findUserIdForSubscription(subscription);
  if (!userId) {
    console.warn("[stripe] No user for subscription", subscription.id);
    return;
  }

  const priceId = subscription.items.data[0]?.price?.id ?? null;
  const mapped = planFromPriceId(priceId);
  const planStatus = statusFromStripe(subscription.status);

  const entitled =
    planStatus === "active" || planStatus === "past_due"
      ? mapped.plan
      : ("free" as const);

  await db
    .update(users)
    .set({
      stripeSubscriptionId: subscription.id,
      stripePriceId: mapped.stripePriceId,
      plan: entitled,
      planStatus,
      ...(typeof subscription.customer === "string"
        ? { stripeCustomerId: subscription.customer }
        : {}),
    })
    .where(eq(users.id, userId));
}

export async function markUserSubscriptionCanceled(userId: string) {
  await db
    .update(users)
    .set({
      plan: "free",
      planStatus: "canceled",
      stripeSubscriptionId: null,
      stripePriceId: null,
    })
    .where(eq(users.id, userId));
}

export async function handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session,
): Promise<void> {
  const parsedUserId = userIdSchema.safeParse(
    session.metadata?.userId || session.client_reference_id,
  );

  if (!parsedUserId.success) {
    console.warn("[stripe] checkout.session.completed missing userId");
    return;
  }
  const userId = parsedUserId.data;

  // Async payment methods complete the session before the money arrives:
  // premium is granted later by syncSubscriptionFromStripe once it is active.
  if (session.payment_status === "unpaid") {
    console.warn("[stripe] checkout.session.completed not paid yet", session.id);
    return;
  }

  const customerId =
    typeof session.customer === "string" ? session.customer : null;
  const subscriptionId =
    typeof session.subscription === "string" ? session.subscription : null;

  await db
    .update(users)
    .set({
      ...(customerId ? { stripeCustomerId: customerId } : {}),
      ...(subscriptionId ? { stripeSubscriptionId: subscriptionId } : {}),
      plan: "premium",
      planStatus: "active",
      stripePriceId: getPremiumPriceId(),
    })
    .where(eq(users.id, userId));
}
