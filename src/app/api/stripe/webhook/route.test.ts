import Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SECRET = "whsec_test_secret";

// Real Stripe SDK for signing/verification (local crypto, no network);
// only the API call and the DB handlers are mocked.
const realStripe = new Stripe("sk_test_dummy");
const { retrieveSubscription, handleCheckout, syncSubscription } = vi.hoisted(
  () => ({
    retrieveSubscription: vi.fn(),
    handleCheckout: vi.fn(),
    syncSubscription: vi.fn(),
  }),
);

// The billing module's server API also loads these; no database is used.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: {} }));

vi.mock("@/modules/billing/infrastructure/stripe/client", () => ({
  getStripe: () => ({
    webhooks: realStripe.webhooks,
    subscriptions: { retrieve: retrieveSubscription },
  }),
}));

vi.mock("@/modules/billing/infrastructure/stripe/webhook-handlers", () => ({
  handleCheckoutSessionCompleted: handleCheckout,
  syncSubscriptionFromStripe: syncSubscription,
}));

import { POST } from "@/app/api/stripe/webhook/route";

function event(type: string, object: Record<string, unknown>) {
  return JSON.stringify({
    id: "evt_test",
    object: "event",
    type,
    data: { object },
  });
}

function signedRequest(payload: string, secret = SECRET) {
  const signature = realStripe.webhooks.generateTestHeaderString({
    payload,
    secret,
  });
  return new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": signature },
    body: payload,
  });
}

describe("POST /api/stripe/webhook", () => {
  beforeEach(() => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects a request without a signature", async () => {
    const response = await POST(
      new Request("http://localhost/api/stripe/webhook", {
        method: "POST",
        body: event("customer.subscription.deleted", { id: "sub_1" }),
      }),
    );
    expect(response.status).toBe(400);
    expect(syncSubscription).not.toHaveBeenCalled();
  });

  it("rejects a payload signed with another secret", async () => {
    const response = await POST(
      signedRequest(event("checkout.session.completed", {}), "whsec_attacker"),
    );
    expect(response.status).toBe(400);
    expect(handleCheckout).not.toHaveBeenCalled();
  });

  it("rejects a body changed after signing", async () => {
    const request = signedRequest(event("checkout.session.completed", { id: "cs_1" }));
    const tampered = new Request(request.url, {
      method: "POST",
      headers: request.headers,
      body: event("checkout.session.completed", { id: "cs_forged" }),
    });
    expect((await POST(tampered)).status).toBe(400);
    expect(handleCheckout).not.toHaveBeenCalled();
  });

  it("returns a generic 500 when the secret is not configured", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    const response = await POST(signedRequest(event("checkout.session.completed", {})));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Webhook not configured" });
  });

  it("syncs a completed checkout session", async () => {
    const session = { id: "cs_1", metadata: { userId: "u1" } };
    const response = await POST(signedRequest(event("checkout.session.completed", session)));
    expect(response.status).toBe(200);
    expect(handleCheckout).toHaveBeenCalledWith(session);
  });

  it.each([
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
  ])("syncs the current subscription state from Stripe on %s", async (type) => {
    const current = { id: "sub_1", status: "canceled" };
    retrieveSubscription.mockResolvedValue(current);

    // The event payload is stale on purpose: the handler must use Stripe's
    // current state, not the (possibly out-of-order) event body.
    const response = await POST(
      signedRequest(event(type, { id: "sub_1", status: "active" })),
    );

    expect(response.status).toBe(200);
    expect(retrieveSubscription).toHaveBeenCalledWith("sub_1");
    expect(syncSubscription).toHaveBeenCalledWith(current);
  });

  it("acknowledges event types it does not handle", async () => {
    const response = await POST(signedRequest(event("invoice.created", { id: "in_1" })));
    expect(response.status).toBe(200);
    expect(handleCheckout).not.toHaveBeenCalled();
    expect(syncSubscription).not.toHaveBeenCalled();
  });

  it("answers 500 (so Stripe retries) without leaking the error", async () => {
    retrieveSubscription.mockRejectedValue(new Error("db password=secret"));
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await POST(
      signedRequest(event("customer.subscription.updated", { id: "sub_1" })),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Webhook handler failed" });
    errorLog.mockRestore();
  });
});
