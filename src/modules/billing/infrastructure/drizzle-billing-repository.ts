import { and, eq, gte } from "drizzle-orm";

import { projects, usageEvents, users } from "@/db/schema";
import type { Db } from "@/lib/db";

import type { BillingRepository } from "../application/ports";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type Executor = Db | Tx;

/**
 * Same queries as the pre-module `lib/billing/entitlements.ts`, so behavior
 * (including the row lock) is unchanged. Pass a transaction to make the
 * FOR UPDATE lock hold until it commits.
 */
export function createBillingRepository(executor: Executor): BillingRepository {
  return {
    async loadUserBilling(userId) {
      const [user] = await executor
        .select({ plan: users.plan, planStatus: users.planStatus })
        .from(users)
        .where(eq(users.id, userId))
        .for("update");
      if (!user) throw new Error("User not found.");
      return user;
    },

    countProjects(userId) {
      return executor.$count(projects, eq(projects.userId, userId));
    },

    countAnalysesSince(userId, since) {
      return executor.$count(
        usageEvents,
        and(
          eq(usageEvents.userId, userId),
          eq(usageEvents.type, "analysis"),
          gte(usageEvents.createdAt, since),
        ),
      );
    },

    async recordAnalysisUsage(userId) {
      await executor.insert(usageEvents).values({ userId, type: "analysis" });
    },

    async loadBillingProfile(userId) {
      const user = await executor.query.users.findFirst({
        where: eq(users.id, userId),
        columns: {
          plan: true,
          planStatus: true,
          stripeCustomerId: true,
          stripeSubscriptionId: true,
        },
      });
      if (!user) throw new Error("User not found.");
      return user;
    },
  };
}
