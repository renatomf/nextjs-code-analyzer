"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { users } from "@/db/schema";
import { auth } from "@/lib/auth";
import { getPaidPlan, isPaidPlan } from "@/lib/billing/plans";
import { getAppUrl, getPremiumPriceId, getStripe } from "@/lib/billing/stripe";
import { syncCustomerSubscriptionsForUser } from "@/lib/billing/sync-checkout";
import { db } from "@/lib/db";
import { assertRateLimit } from "@/lib/rate-limit";

// Every billing action calls the Stripe API: cap it per user.
const BILLING_ACTION_MAX_PER_HOUR = 20;

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  await assertRateLimit(
    `billing:${session.user.id}`,
    BILLING_ACTION_MAX_PER_HOUR,
    60 * 60 * 1000,
    "Too many billing requests. Try again later.",
  );
  return session.user.id;
}

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
    redirect("/settings");
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

/** Start Stripe Checkout for the Premium subscription. */
export async function startPremiumCheckout() {
  const userId = await requireUserId();
  const stripe = getStripe();
  const customerId = await ensureStripeCustomer(userId);
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

  redirect(session.url);
}

export async function startProCheckout() {
  return startPremiumCheckout();
}

/**
 * Create a Stripe Customer Portal session for plan/payment management. Returns
 * the URL (instead of redirecting) so the client can open it in a new tab.
 */
export async function openBillingPortal(): Promise<
  { url: string } | { error: string }
> {
  const userId = await requireUserId();
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { stripeCustomerId: true },
  });

  if (!user?.stripeCustomerId) {
    return {
      error: `No Stripe customer on file. Upgrade to ${getPaidPlan().label} first.`,
    };
  }

  try {
    const stripe = getStripe();
    const appUrl = getAppUrl();
    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${appUrl}/settings`,
    });
    return { url: session.url };
  } catch {
    console.error("Failed to create billing portal session");
    return { error: "Could not open the billing portal. Try again." };
  }
}

/** Pull latest subscription state from Stripe into our DB. */
export async function refreshBillingFromStripe() {
  const userId = await requireUserId();
  const ok = await syncCustomerSubscriptionsForUser(userId);
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  if (!ok) {
    redirect("/settings?billing=sync_failed");
  }
  redirect("/settings?billing=synced");
}
