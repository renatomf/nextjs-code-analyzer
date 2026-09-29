import "server-only";

import { db } from "@/lib/db";

import { createQuota, getBillingSnapshot as snapshotFor } from "./application/quota";
import {
  createBillingRepository,
  type Executor,
} from "./infrastructure/drizzle-billing-repository";
import { getPlanCatalog } from "./index";

/**
 * Public API of the billing module — server part (ADR-001): use cases bound
 * to the database. Import from server code only.
 */

function depsFor(executor: Executor) {
  return {
    repo: createBillingRepository(executor),
    catalog: getPlanCatalog,
    now: () => new Date(),
  };
}

/**
 * Quota checks bound to `executor`. Pass the caller's transaction so the
 * user-row lock holds until it commits. Prefer `withQuota`, which cannot be
 * called without the transaction.
 */
export function billingFor(executor: Executor = db) {
  return createQuota(depsFor(executor));
}

/** `userId` must come from the server session. */
export function getBillingSnapshot(userId: string) {
  return snapshotFor(depsFor(db), userId);
}

export type QuotaKind = "project" | "analysis";
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Runs `work` in one transaction that locks the user row, checks the plan
 * limit, and records the analysis usage only when `work` reports the quota
 * as consumed — or rolls everything back if anything throws.
 *
 * `work` must only do quick database writes: the user row stays locked
 * until it returns (downloads and extraction belong outside).
 */
export function withQuota<T>(
  userId: string,
  kind: QuotaKind,
  work: (tx: Tx) => Promise<{ consumed: boolean; value: T }>,
): Promise<T> {
  return db.transaction(async (tx) => {
    const quota = createQuota(depsFor(tx));
    if (kind === "project") await quota.assertCanCreateProject(userId);
    else await quota.assertCanRunAnalysis(userId);

    const { consumed, value } = await work(tx);
    if (consumed) await quota.recordAnalysisUsage(userId);
    return value;
  });
}
