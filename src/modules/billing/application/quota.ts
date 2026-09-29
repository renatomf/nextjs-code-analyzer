import type { PlanCatalog } from "../domain/plan";
import { limitsFor } from "../domain/plan";
import {
  assertAnalysisQuota,
  assertProjectQuota,
  quotaDayStart,
} from "../domain/quota";
import type { BillingRepository } from "./ports";

export type QuotaDeps = {
  repo: BillingRepository;
  /** Read on every call: plan limits can change through configuration. */
  catalog: () => PlanCatalog;
  now: () => Date;
};

export function createQuota({ repo, catalog, now }: QuotaDeps) {
  async function assertCanRunAnalysis(userId: string): Promise<void> {
    const user = await repo.loadUserBilling(userId);
    const plans = catalog();
    const limits = limitsFor(plans, user.plan, user.planStatus);
    const used = await repo.countAnalysesSince(userId, quotaDayStart(now()));
    assertAnalysisQuota(plans, limits, used);
  }

  async function assertCanCreateProject(userId: string): Promise<void> {
    const user = await repo.loadUserBilling(userId);
    const plans = catalog();
    const limits = limitsFor(plans, user.plan, user.planStatus);
    const projectCount = await repo.countProjects(userId);
    assertProjectQuota(plans, limits, projectCount);
    // Creating a project also runs its first analysis.
    await assertCanRunAnalysis(userId);
  }

  return {
    assertCanRunAnalysis,
    assertCanCreateProject,
    recordAnalysisUsage: (userId: string, usageId?: string) =>
      repo.recordAnalysisUsage(userId, usageId),
    /** ADR-003: only for failures on our side, never for user errors. */
    refundAnalysisUsage: (userId: string, usageId: string) =>
      repo.deleteAnalysisUsage(userId, usageId),
  };
}

/** Plan, limits and usage for the settings page and the app shell. */
export async function getBillingSnapshot(
  { repo, catalog, now }: QuotaDeps,
  userId: string,
) {
  const user = await repo.loadBillingProfile(userId);
  const limits = limitsFor(catalog(), user.plan, user.planStatus);
  const analysesUsedToday = await repo.countAnalysesSince(userId, quotaDayStart(now()));
  const projectCount = await repo.countProjects(userId);

  return {
    plan: user.plan,
    planStatus: user.planStatus,
    limits,
    analysesUsedToday,
    projectCount,
    // Only booleans leave the server, never the Stripe ids.
    hasStripeCustomer: Boolean(user.stripeCustomerId),
    hasSubscription: Boolean(user.stripeSubscriptionId),
  };
}
