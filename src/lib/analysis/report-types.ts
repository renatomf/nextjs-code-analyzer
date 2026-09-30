/**
 * Legacy entry point kept while callers migrate to `@/modules/analysis`
 * (strangler, ADR-001). `ReportIssue` is the module's `Finding`.
 */

export {
  SEVERITY_ORDER,
  SEVERITY_PENALTY,
  type CategoryScores,
  type CategorySummaries,
  type Finding as ReportIssue,
  type IssueCategory,
  type IssueSeverity,
} from "@/modules/analysis";
