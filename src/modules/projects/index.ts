/**
 * Public API of the projects module — pure part (ADR-001). Safe to import
 * anywhere. Database-bound code is in `./server`.
 */

export {
  AnalysisCanceledError,
  analysisStart,
  type AnalysisStart,
  type ProjectStatus,
} from "./domain/project";
