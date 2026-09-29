import { beforeEach, describe, expect, it, vi } from "vitest";

const { findFirst, where, createCustomer, createCheckout, createPortal } = vi.hoisted(() => ({
  findFirst: vi.fn(),
  where: vi.fn(),
  createCustomer: vi.fn(),
  createCheckout: vi.fn(),
  createPortal: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: { users: { findFirst } },
    update: () => ({ set: () => ({ where }) }),
  },
}));

vi.mock("./client", () => ({
  getAppUrl: () => "https://app.test",
  getPremiumPriceId: () => "price_premium_test",
  getStripe: () => ({
    customers: { create: createCustomer },
    checkout: { sessions: { create: createCheckout } },
    billingPortal: { sessions: { create: createPortal } },
  }),
}));

import { createBillingPortalSession, createPremiumCheckout } from "./checkout";

const USER_ID = "11111111-1111-4111-8111-111111111111";

function freeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    email: "a@b.test",
    name: "A",
    stripeCustomerId: "cus_1",
    plan: "free",
    planStatus: "none",
    ...overrides,
  };
}

describe("createPremiumCheckout", () => {
  beforeEach(() => {
    createCheckout.mockResolvedValue({ url: "https://checkout.stripe.test/s" });
  });

  it("never starts a second subscription for a paid user", async () => {
    findFirst.mockResolvedValue(freeUser({ plan: "premium", planStatus: "active" }));

    expect(await createPremiumCheckout(USER_ID)).toEqual({ alreadySubscribed: true });
    expect(createCustomer).not.toHaveBeenCalled();
    expect(createCheckout).not.toHaveBeenCalled();
  });

  it("creates the session for the server-side user and the configured price", async () => {
    findFirst.mockResolvedValue(freeUser());

    expect(await createPremiumCheckout(USER_ID)).toEqual({
      url: "https://checkout.stripe.test/s",
    });
    expect(createCustomer).not.toHaveBeenCalled();
    expect(createCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "subscription",
        customer: "cus_1",
        line_items: [{ price: "price_premium_test", quantity: 1 }],
        client_reference_id: USER_ID,
        metadata: { userId: USER_ID, plan: "premium" },
        subscription_data: { metadata: { userId: USER_ID, plan: "premium" } },
        success_url:
          "https://app.test/settings?billing=success&session_id={CHECKOUT_SESSION_ID}",
      }),
    );
  });

  it("creates the Stripe customer once (idempotency key) and stores it", async () => {
    findFirst.mockResolvedValue(freeUser({ stripeCustomerId: null }));
    createCustomer.mockResolvedValue({ id: "cus_new" });

    await createPremiumCheckout(USER_ID);

    expect(createCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { userId: USER_ID } }),
      { idempotencyKey: `customer-create-${USER_ID}` },
    );
    expect(where).toHaveBeenCalled();
    expect(createCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_new" }),
    );
  });

  it("fails when Stripe returns no redirect URL", async () => {
    findFirst.mockResolvedValue(freeUser());
    createCheckout.mockResolvedValue({ url: null });

    await expect(createPremiumCheckout(USER_ID)).rejects.toThrow(
      "Stripe Checkout did not return a redirect URL.",
    );
  });
});

describe("createBillingPortalSession", () => {
  it("reports a user without a Stripe customer", async () => {
    findFirst.mockResolvedValue({ stripeCustomerId: null });

    expect(await createBillingPortalSession(USER_ID)).toEqual({ error: "no_customer" });
    expect(createPortal).not.toHaveBeenCalled();
  });

  it("returns the portal URL for the user's own customer", async () => {
    findFirst.mockResolvedValue({ stripeCustomerId: "cus_1" });
    createPortal.mockResolvedValue({ url: "https://billing.stripe.test/p" });

    expect(await createBillingPortalSession(USER_ID)).toEqual({
      url: "https://billing.stripe.test/p",
    });
    expect(createPortal).toHaveBeenCalledWith({
      customer: "cus_1",
      return_url: "https://app.test/settings",
    });
  });

  it("returns a generic failure without leaking the Stripe error", async () => {
    findFirst.mockResolvedValue({ stripeCustomerId: "cus_1" });
    createPortal.mockRejectedValue(new Error("sk_live_secret invalid"));
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await createBillingPortalSession(USER_ID)).toEqual({ error: "failed" });
    errorLog.mockRestore();
  });
});
