/**
 * Legacy entry point kept while callers migrate to `@/modules/analysis`
 * (strangler, ADR-001).
 */

export {
  computeDeterministicMetrics,
  type DeterministicMetrics,
  type SourceFile,
} from "@/modules/analysis";
