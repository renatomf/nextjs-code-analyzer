/**
 * Public API of the billing module — pure part (ADR-001). Safe to import
 * anywhere (no database, no server-only code). Database-bound use cases are
 * in `./server`. `domain/`, `application/` and `infrastructure/` are
 * internal.
 */

import { buildPlanCatalog, type PlanCatalog } from "./domain/plan";
import { readPlanConfig } from "./infrastructure/plan-config";

export {
  PAID_PLAN_ID,
  effectivePlanId,
  isPaidPlan,
  limitsFor,
  type PlanCatalog,
  type PlanId,
  type PlanLimits,
  type PlanStatus,
} from "./domain/plan";
export { BillingLimitError } from "./domain/quota";
export { estimateCostMicroUsd, type LlmFeature, type LlmUsage } from "./domain/llm-cost";

/** Plan catalog from the current configuration (read on every call). */
export function getPlanCatalog(): PlanCatalog {
  return buildPlanCatalog(readPlanConfig());
}
