import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { update, set, where, findFirst } = vi.hoisted(() => {
  const where = vi.fn();
  const set = vi.fn(() => ({ where }));
  return {
    update: vi.fn(() => ({ set })),
    set,
    where,
    findFirst: vi.fn(),
  };
});

// eq() returns a plain object so the tests can assert which row is updated.
vi.mock("drizzle-orm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("drizzle-orm")>()),
  eq: (column: unknown, value: unknown) => ({ eq: [column, value] }),
}));

vi.mock("@/lib/db", () => ({
  db: {
    update,
    query: { users: { findFirst } },
  },
}));

vi.mock("@/lib/billing/stripe", () => ({
  getPremiumPriceId: () => "price_premium_test",
}));

import { users } from "@/db/schema";
import {
  handleCheckoutSessionCompleted,
  markUserSubscriptionCanceled,
  syncSubscriptionFromStripe,
} from "@/lib/billing/webhook-handlers";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const CUSTOMER_USER_ID = "22222222-2222-4222-8222-222222222222";

function fakeSubscription(
  overrides: Partial<Stripe.Subscription> & {
    metadata?: Record<string, string>;
    status?: Stripe.Subscription.Status;
    priceId?: string;
  } = {},
): Stripe.Subscription {
  const priceId = overrides.priceId ?? "price_premium_test";
  return {
    id: "sub_test",
    object: "subscription",
    customer: "cus_test",
    status: overrides.status ?? "active",
    metadata: overrides.metadata ?? { userId: USER_ID },
    items: {
      object: "list",
      data: [
        {
          id: "si_1",
          object: "subscription_item",
          price: { id: priceId, object: "price" },
        } as Stripe.SubscriptionItem,
      ],
      has_more: false,
      url: "",
    },
    ...overrides,
  } as Stripe.Subscription;
}

describe("webhook-handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("handleCheckoutSessionCompleted sets premium active", async () => {
    await handleCheckoutSessionCompleted({
      id: "cs_test",
      object: "checkout.session",
      metadata: { userId: USER_ID },
      customer: "cus_test",
      subscription: "sub_test",
      payment_status: "paid",
    } as unknown as Stripe.Checkout.Session);

    expect(update).toHaveBeenCalledWith(users);
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        plan: "premium",
        planStatus: "active",
        stripeCustomerId: "cus_test",
        stripeSubscriptionId: "sub_test",
        stripePriceId: "price_premium_test",
      }),
    );
    expect(where).toHaveBeenCalledWith({ eq: [users.id, USER_ID] });
  });

  it("handleCheckoutSessionCompleted no-ops without userId", async () => {
    await handleCheckoutSessionCompleted({
      id: "cs_test",
      object: "checkout.session",
      metadata: {},
      client_reference_id: null,
    } as unknown as Stripe.Checkout.Session);

    expect(update).not.toHaveBeenCalled();
  });

  it("handleCheckoutSessionCompleted ignores a non-uuid userId", async () => {
    await handleCheckoutSessionCompleted({
      id: "cs_test",
      object: "checkout.session",
      metadata: { userId: "user-1" },
    } as unknown as Stripe.Checkout.Session);

    expect(update).not.toHaveBeenCalled();
  });

  it("handleCheckoutSessionCompleted does not grant premium while unpaid", async () => {
    await handleCheckoutSessionCompleted({
      id: "cs_test",
      object: "checkout.session",
      metadata: { userId: USER_ID },
      payment_status: "unpaid",
    } as unknown as Stripe.Checkout.Session);

    expect(update).not.toHaveBeenCalled();
  });

  it("syncSubscriptionFromStripe maps active sub to premium", async () => {
    await syncSubscriptionFromStripe(fakeSubscription());

    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        plan: "premium",
        planStatus: "active",
        stripeSubscriptionId: "sub_test",
      }),
    );
    expect(where).toHaveBeenCalledWith({ eq: [users.id, USER_ID] });
  });

  it("syncSubscriptionFromStripe downgrades canceled sub to free", async () => {
    await syncSubscriptionFromStripe(fakeSubscription({ status: "canceled" }));

    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        plan: "free",
        planStatus: "canceled",
      }),
    );
  });

  // TD-25: product rule pinned by tests. A failed renewal keeps premium as a
  // grace period — including Stripe's "unpaid" (retries exhausted), which is
  // mapped to past_due. Changing this is a product decision, not a refactor.
  it.each(["past_due", "unpaid"] as const)(
    "syncSubscriptionFromStripe keeps premium while %s (grace period)",
    async (status) => {
      await syncSubscriptionFromStripe(fakeSubscription({ status }));

      expect(set).toHaveBeenCalledWith(
        expect.objectContaining({ plan: "premium", planStatus: "past_due" }),
      );
    },
  );

  it("syncSubscriptionFromStripe never grants premium for an unknown price", async () => {
    await syncSubscriptionFromStripe(
      fakeSubscription({ priceId: "price_other" }),
    );

    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        plan: "free",
        stripePriceId: "price_other",
      }),
    );
  });

  it("syncSubscriptionFromStripe finds user by stripe customer", async () => {
    findFirst.mockResolvedValue({ id: CUSTOMER_USER_ID });

    await syncSubscriptionFromStripe(fakeSubscription({ metadata: {} }));

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { eq: [users.stripeCustomerId, "cus_test"] },
      }),
    );
    expect(where).toHaveBeenCalledWith({ eq: [users.id, CUSTOMER_USER_ID] });
  });

  it("markUserSubscriptionCanceled clears paid fields", async () => {
    await markUserSubscriptionCanceled(USER_ID);

    expect(set).toHaveBeenCalledWith({
      plan: "free",
      planStatus: "canceled",
      stripeSubscriptionId: null,
      stripePriceId: null,
    });
    expect(where).toHaveBeenCalledWith({ eq: [users.id, USER_ID] });
  });
});
