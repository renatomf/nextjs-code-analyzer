import type Stripe from "stripe";
import { describe, expect, it } from "vitest";

import { planStatusFromStripe, subscriptionTermsFromStripe } from "./translate";

describe("planStatusFromStripe", () => {
  it.each([
    ["active", "active"],
    ["trialing", "active"],
    ["past_due", "past_due"],
    ["unpaid", "past_due"],
    ["canceled", "canceled"],
    ["incomplete_expired", "canceled"],
    ["paused", "canceled"],
    ["incomplete", "none"],
  ] as const)("maps %s to %s", (stripeStatus, planStatus) => {
    expect(planStatusFromStripe(stripeStatus)).toBe(planStatus);
  });

  it("maps a status Stripe adds later to none (grants nothing)", () => {
    expect(planStatusFromStripe("some_future_status")).toBe("none");
  });
});

describe("subscriptionTermsFromStripe", () => {
  const subscription = (items: unknown[], status = "active") =>
    ({ id: "sub_1", status, items: { data: items } }) as unknown as Stripe.Subscription;

  it("reads the first item's price and translates the status", () => {
    expect(
      subscriptionTermsFromStripe(subscription([{ price: { id: "price_1" } }], "unpaid")),
    ).toEqual({ priceId: "price_1", status: "past_due" });
  });

  it("has no price when the subscription has no items", () => {
    expect(subscriptionTermsFromStripe(subscription([]))).toEqual({
      priceId: null,
      status: "active",
    });
  });
});
