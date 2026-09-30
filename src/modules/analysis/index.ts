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
  type Occurrence,
} from "./domain/finding";
export {
  verifyEvidence,
  type ClaimedIssue,
  type ReviewedChunk,
} from "./domain/evidence";
export { buildReportFindings, groupFindings } from "./domain/grouping";
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
  diminishingPenaltyPolicy,
  findingPenalty,
  linearPenaltyPolicy,
  scoreFromIssues,
  type CategoryScores,
  type CategorySummaries,
  type ScoringPolicy,
} from "./domain/scoring";
