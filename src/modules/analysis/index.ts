/**
 * Public API of the analysis module — pure part (ADR-001). Safe to import
 * anywhere, including client components (no Node APIs, no database).
 */

export {
  SEVERITY_ORDER,
  sortFindings,
  type Evidence,
  type Finding,
  type IssueCategory,
  type IssueSeverity,
} from "./domain/finding";
export {
  computeDeterministicMetrics,
  type DeterministicMetrics,
  type SourceFile,
} from "./domain/metrics";
export {
  DETERMINISTIC_RULES,
  type ProjectMeasures,
  type Rule,
} from "./domain/rules";
export {
  SEVERITY_PENALTY,
  linearPenaltyPolicy,
  scoreFromIssues,
  type CategoryScores,
  type CategorySummaries,
  type ScoringPolicy,
} from "./domain/scoring";
