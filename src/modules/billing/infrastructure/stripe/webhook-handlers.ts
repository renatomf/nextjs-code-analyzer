import { logger } from "@/shared/logger";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { z } from "zod";

import { users } from "@/db/schema";
import { db } from "@/lib/db";

import { entitlementFor } from "../../domain/subscription";
import { getPremiumPriceId } from "./client";
import { subscriptionTermsFromStripe } from "./translate";

const userIdSchema = z.uuid();

/** Null when the premium price is not configured in this environment. */
function premiumPriceIdOrNull(): string | null {
  try {
    return getPremiumPriceId();
  } catch {
    return null;
  }
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
    logger.warn("stripe.subscription_without_user", { subscriptionId: subscription.id });
    return;
  }

  const { plan, planStatus, priceId } = entitlementFor(
    subscriptionTermsFromStripe(subscription),
    premiumPriceIdOrNull(),
  );

  await db
    .update(users)
    .set({
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId,
      plan,
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
    logger.warn("stripe.checkout_missing_user");
    return;
  }
  const userId = parsedUserId.data;

  // Async payment methods complete the session before the money arrives:
  // premium is granted later by syncSubscriptionFromStripe once it is active.
  if (session.payment_status === "unpaid") {
    logger.warn("stripe.checkout_not_paid", { sessionId: session.id });
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
