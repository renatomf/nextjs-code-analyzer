"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { assertRateLimit } from "@/lib/rate-limit";
import { getPlanCatalog } from "@/modules/billing";
import {
  createBillingPortalSession,
  createPremiumCheckout,
  syncCustomerSubscriptionsForUser,
} from "@/modules/billing/server";

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

/** Start Stripe Checkout for the Premium subscription. */
export async function startPremiumCheckout() {
  const userId = await requireUserId();
  const checkout = await createPremiumCheckout(userId);

  // Already subscribed: never start a second (double-billed) subscription.
  if ("alreadySubscribed" in checkout) redirect("/settings");

  redirect(checkout.url);
}

/**
 * Create a Stripe Customer Portal session for plan/payment management. Returns
 * the URL (instead of redirecting) so the client can open it in a new tab.
 */
export async function openBillingPortal(): Promise<
  { url: string } | { error: string }
> {
  const userId = await requireUserId();
  const portal = await createBillingPortalSession(userId);

  if ("url" in portal) return { url: portal.url };
  if (portal.error === "no_customer") {
    return {
      error: `No Stripe customer on file. Upgrade to ${getPlanCatalog().premium.label} first.`,
    };
  }
  return { error: "Could not open the billing portal. Try again." };
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
