import "server-only";

import { billingFor, getBillingSnapshot as snapshot } from "@/modules/billing/server";
import type { Db } from "@/lib/db";
import { db } from "@/lib/db";

/**
 * Legacy entry point kept while callers migrate to `@/modules/billing`
 * (strangler, ADR-001). Same signatures and behavior; the implementation
 * lives in the module. Removed once no caller imports it.
 */

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Executor = Db | Tx;

export { BillingLimitError } from "@/modules/billing";

/** Record one analysis attempt (new project or re-analyze). */
export function recordAnalysisUsage(userId: string, executor: Executor = db): Promise<void> {
  return billingFor(executor).recordAnalysisUsage(userId);
}

export function assertCanCreateProject(userId: string, executor: Executor = db): Promise<void> {
  return billingFor(executor).assertCanCreateProject(userId);
}

export function assertCanRunAnalysis(userId: string, executor: Executor = db): Promise<void> {
  return billingFor(executor).assertCanRunAnalysis(userId);
}

/** `userId` must come from the server session. */
export function getBillingSnapshot(userId: string) {
  return snapshot(userId);
}
