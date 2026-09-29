import { beforeEach, describe, expect, it, vi } from "vitest";

const { findFirst, listSubscriptions, syncSubscription } = vi.hoisted(() => ({
  findFirst: vi.fn(),
  listSubscriptions: vi.fn(),
  syncSubscription: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: { query: { users: { findFirst } } },
}));

vi.mock("@/lib/billing/stripe", () => ({
  getStripe: () => ({ subscriptions: { list: listSubscriptions } }),
}));

vi.mock("./webhook-handlers", () => ({
  handleCheckoutSessionCompleted: vi.fn(),
  syncSubscriptionFromStripe: syncSubscription,
}));

import { syncCustomerSubscriptionsForUser } from "@/lib/billing/sync-checkout";

const USER_ID = "11111111-1111-4111-8111-111111111111";

describe("syncCustomerSubscriptionsForUser", () => {
  beforeEach(() => {
    findFirst.mockResolvedValue({ stripeCustomerId: "cus_1" });
  });

  it("does nothing for a user without a Stripe customer", async () => {
    findFirst.mockResolvedValue({ stripeCustomerId: null });
    expect(await syncCustomerSubscriptionsForUser(USER_ID)).toBe(false);
    expect(listSubscriptions).not.toHaveBeenCalled();
  });

  it("syncs the live subscription when there is one", async () => {
    const active = { id: "sub_active", status: "active" };
    listSubscriptions.mockResolvedValue({
      data: [{ id: "sub_old", status: "canceled" }, active],
    });

    expect(await syncCustomerSubscriptionsForUser(USER_ID)).toBe(true);
    expect(syncSubscription).toHaveBeenCalledWith(active);
  });

  it("syncs the latest subscription when none is live, so a canceled plan is downgraded (TD-37)", async () => {
    const latest = { id: "sub_latest", status: "canceled" };
    listSubscriptions.mockResolvedValue({
      data: [latest, { id: "sub_older", status: "incomplete_expired" }],
    });

    expect(await syncCustomerSubscriptionsForUser(USER_ID)).toBe(true);
    expect(syncSubscription).toHaveBeenCalledWith(latest);
  });

  it("reports failure when the customer has no subscriptions", async () => {
    listSubscriptions.mockResolvedValue({ data: [] });
    expect(await syncCustomerSubscriptionsForUser(USER_ID)).toBe(false);
    expect(syncSubscription).not.toHaveBeenCalled();
  });
});
