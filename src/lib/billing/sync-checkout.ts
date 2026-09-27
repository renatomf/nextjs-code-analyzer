import { eq } from "drizzle-orm";
import { z } from "zod";

import { users } from "@/db/schema";
import { getStripe } from "@/lib/billing/stripe";
import { db } from "@/lib/db";
import {
  handleCheckoutSessionCompleted,
  syncSubscriptionFromStripe,
} from "./webhook-handlers";

// session_id comes from the success URL query string (user-controlled).
const checkoutSessionIdSchema = z.string().regex(/^cs_(test|live)_[A-Za-z0-9]+$/);

/**
 * After Checkout redirect, sync the session even if the webhook was missed
 */
export async function syncCheckoutSessionForUser(
  userId: string,
  checkoutSessionId: string,
): Promise<boolean> {
  const parsedId = checkoutSessionIdSchema.safeParse(checkoutSessionId);
  if (!parsedId.success) return false;

  const stripe = getStripe();
  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(parsedId.data, {
      expand: ["subscription"],
    });
  } catch {
    console.warn("[stripe] could not retrieve checkout session");
    return false;
  }

  const sessionUserId =
    session.metadata?.userId || session.client_reference_id || null;

  // Only sync sessions created for this user (a missing userId is rejected too).
  if (sessionUserId !== userId) {
    console.warn("[stripe] checkout session user mismatch", {
      sessionUserId,
      userId,
    });
    return false;
  }

  if (session.status !== "complete" && session.payment_status !== "paid") {
    return false;
  }

  await handleCheckoutSessionCompleted(session);

  const subscription =
    typeof session.subscription === "string"
      ? await stripe.subscriptions.retrieve(session.subscription)
      : session.subscription;

  if (subscription && typeof subscription !== "string") {
    await syncSubscriptionFromStripe(subscription);
  }

  return true;
}

/** Recover plan from Stripe by listing the customer's subscriptions. */
export async function syncCustomerSubscriptionsForUser(
  userId: string,
): Promise<boolean> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { stripeCustomerId: true },
  });
  if (!user?.stripeCustomerId) return false;

  const stripe = getStripe();
  const list = await stripe.subscriptions.list({
    customer: user.stripeCustomerId,
    status: "all",
    limit: 5,
  });

  const active = list.data.find(
    (sub) =>
      sub.status === "active" ||
      sub.status === "trialing" ||
      sub.status === "past_due",
  );

  if (!active) return false;

  await syncSubscriptionFromStripe(active);
  return true;
}
