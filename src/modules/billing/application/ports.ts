import type { PlanId, PlanStatus } from "../domain/plan";

/** What the billing use cases need from storage. Implemented with Drizzle. */
export type UserBilling = {
  plan: PlanId;
  planStatus: PlanStatus;
};

export type BillingProfile = UserBilling & {
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
};

export interface BillingRepository {
  /**
   * Plan of the user. Inside a transaction, the implementation locks the
   * user row (FOR UPDATE) so concurrent limit checks wait for each other.
   * Throws when the user does not exist.
   */
  loadUserBilling(userId: string): Promise<UserBilling>;
  countProjects(userId: string): Promise<number>;
  countAnalysesSince(userId: string, since: Date): Promise<number>;
  recordAnalysisUsage(userId: string): Promise<void>;
  /** Throws when the user does not exist. */
  loadBillingProfile(userId: string): Promise<BillingProfile>;
}
