/**
 * Legacy entry point kept while the pipeline and the import actions migrate
 * (strangler, ADR-001): the lifecycle now lives in `@/modules/projects`.
 */

export {
  ANALYSIS_STEPS,
  type AnalysisStepId,
} from "@/lib/analysis/progress-steps";
export { AnalysisCanceledError } from "@/modules/projects";
export { setProjectProgress } from "@/modules/projects/server";
