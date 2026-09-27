import Stripe from "stripe";

let stripeClient: Stripe | null = null;

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. Add it from https://dashboard.stripe.com/apikeys",
    );
  }

  if (!stripeClient) {
    stripeClient = new Stripe(key, {
      apiVersion: "2026-08-26.dahlia",
      typescript: true,
    });
  }

  return stripeClient;
}

/** Stripe Price ID for the Premium subscription. */
export function getPremiumPriceId(): string {
  const priceId =
    process.env.STRIPE_PRICE_PREMIUM || process.env.STRIPE_PRICE_PRO_MONTHLY; // legacy alias
  if (!priceId) {
    throw new Error(
      "STRIPE_PRICE_PREMIUM is not set. Create a recurring Price in Stripe and paste the price_… id.",
    );
  }
  return priceId;
}

export function getAppUrl(): string {
  const url =
    process.env.AUTH_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (url) return url;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_URL is not set");
  }
  return "http://localhost:3000";
}

/** Human-readable price from Stripe Price object, e.g. "$99/mo". */
export async function fetchPremiumPriceLabel(): Promise<string | null> {
  try {
    const stripe = getStripe();
    const price = await stripe.prices.retrieve(getPremiumPriceId());
    if (price.unit_amount == null) return null;

    const formatted = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: price.currency || "usd",
      minimumFractionDigits: price.unit_amount % 100 === 0 ? 0 : 2,
    }).format(price.unit_amount / 100);

    const interval = price.recurring?.interval;
    if (interval === "month") return `${formatted}/mo`;
    if (interval === "year") return `${formatted}/yr`;
    if (interval === "week") return `${formatted}/wk`;
    return formatted;
  } catch (error) {
    console.warn("[stripe] could not load premium price label", error);
    return null;
  }
}
