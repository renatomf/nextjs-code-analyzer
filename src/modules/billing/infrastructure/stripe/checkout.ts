import { logger } from "@/shared/logger";
import { eq } from "drizzle-orm";

import { users } from "@/db/schema";
import { db } from "@/lib/db";

import { isPaidPlan } from "../../domain/plan";
import { getAppUrl, getPremiumPriceId, getStripe } from "./client";

async function ensureStripeCustomer(userId: string) {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: {
      id: true,
      email: true,
      name: true,
      stripeCustomerId: true,
      plan: true,
      planStatus: true,
    },
  });
  if (!user) throw new Error("User not found.");

  // Already subscribed: never start a second (double-billed) subscription.
  if (isPaidPlan(user.plan, user.planStatus)) {
    return null;
  }

  if (user.stripeCustomerId) {
    return user.stripeCustomerId;
  }

  const stripe = getStripe();
  const customer = await stripe.customers.create(
    {
      email: user.email ?? undefined,
      name: user.name ?? undefined,
      metadata: { userId: user.id },
    },
    // Concurrent checkouts reuse the same customer instead of creating two.
    { idempotencyKey: `customer-create-${user.id}` },
  );

  await db
    .update(users)
    .set({ stripeCustomerId: customer.id })
    .where(eq(users.id, user.id));

  return customer.id;
}

/** Stripe Checkout URL for the Premium subscription. */
export async function createPremiumCheckout(
  userId: string,
): Promise<{ url: string } | { alreadySubscribed: true }> {
  const stripe = getStripe();
  const customerId = await ensureStripeCustomer(userId);
  if (!customerId) return { alreadySubscribed: true };
  const appUrl = getAppUrl();

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: getPremiumPriceId(), quantity: 1 }],
    success_url: `${appUrl}/settings?billing=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/settings?billing=canceled`,
    client_reference_id: userId,
    metadata: { userId, plan: "premium" },
    subscription_data: {
      metadata: { userId, plan: "premium" },
    },
    allow_promotion_codes: true,
  });

  if (!session.url) {
    throw new Error("Stripe Checkout did not return a redirect URL.");
  }

  return { url: session.url };
}

/** Stripe Customer Portal URL for plan/payment management. */
export async function createBillingPortalSession(
  userId: string,
): Promise<{ url: string } | { error: "no_customer" | "failed" }> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { stripeCustomerId: true },
  });

  if (!user?.stripeCustomerId) {
    return { error: "no_customer" };
  }

  try {
    const stripe = getStripe();
    const appUrl = getAppUrl();
    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${appUrl}/settings`,
    });
    return { url: session.url };
  } catch (error) {
    logger.error("billing.portal_failed", { err: error, userId });
    return { error: "failed" };
  }
}
