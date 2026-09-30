import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { users } from "@/db/schema";
import { db } from "@/lib/db";
import { getPlanCatalog } from "@/modules/billing";
import { getPlanLimitsFor } from "@/modules/billing/server";
import { createUser, deleteUsers } from "@/test/integration/factories";

// The plan limits used by rate limits outside the quota transaction (chat).

const created: string[] = [];

afterAll(async () => {
  await deleteUsers(created);
});

async function userWithPlan(plan: "free" | "premium", planStatus: "none" | "active" | "past_due" | "canceled") {
  const id = await createUser();
  created.push(id);
  await db.update(users).set({ plan, planStatus }).where(eq(users.id, id));
  return id;
}

describe("getPlanLimitsFor", () => {
  const catalog = getPlanCatalog();

  it("gives a free user the free limits", async () => {
    expect(await getPlanLimitsFor(await userWithPlan("free", "none"))).toEqual(catalog.free);
  });

  it("gives an active or past-due premium user the premium limits", async () => {
    expect(await getPlanLimitsFor(await userWithPlan("premium", "active"))).toEqual(catalog.premium);
    expect(await getPlanLimitsFor(await userWithPlan("premium", "past_due"))).toEqual(
      catalog.premium,
    );
  });

  it("falls back to the free limits for a canceled plan or a missing user", async () => {
    expect(await getPlanLimitsFor(await userWithPlan("premium", "canceled"))).toEqual(catalog.free);
    expect(await getPlanLimitsFor(randomUUID())).toEqual(catalog.free);
  });
});
