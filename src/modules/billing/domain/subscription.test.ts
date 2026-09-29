import { describe, expect, it } from "vitest";

import { entitlementFor } from "./subscription";

const PREMIUM = "price_premium";

describe("entitlementFor", () => {
  it("grants premium for the configured price while active", () => {
    expect(entitlementFor({ priceId: PREMIUM, status: "active" }, PREMIUM)).toEqual({
      plan: "premium",
      planStatus: "active",
      priceId: PREMIUM,
    });
  });

  // TD-25: a failed renewal keeps the plan as a grace period.
  it("keeps premium while past_due", () => {
    expect(entitlementFor({ priceId: PREMIUM, status: "past_due" }, PREMIUM).plan).toBe(
      "premium",
    );
  });

  it.each(["canceled", "none"] as const)("falls back to free when %s", (status) => {
    expect(entitlementFor({ priceId: PREMIUM, status }, PREMIUM)).toEqual({
      plan: "free",
      planStatus: status,
      priceId: PREMIUM,
    });
  });

  it("never grants premium for an unknown price, but keeps the price", () => {
    expect(entitlementFor({ priceId: "price_other", status: "active" }, PREMIUM)).toEqual({
      plan: "free",
      planStatus: "active",
      priceId: "price_other",
    });
  });

  it("never grants premium when the premium price is not configured", () => {
    expect(entitlementFor({ priceId: PREMIUM, status: "active" }, null).plan).toBe("free");
  });

  it.each([null, ""])("treats a missing price (%j) as free with no price", (priceId) => {
    expect(entitlementFor({ priceId, status: "active" }, PREMIUM)).toEqual({
      plan: "free",
      planStatus: "active",
      priceId: null,
    });
  });
});
