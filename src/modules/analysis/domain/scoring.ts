import type { Finding, IssueCategory, IssueSeverity } from "./finding";
import type { ProjectMeasures } from "./rules";

export type CategoryScores = Record<IssueCategory, number>;
export type CategorySummaries = Record<IssueCategory, string>;

export const SEVERITY_PENALTY: Record<IssueSeverity, number> = {
  critical: 20,
  high: 12,
  medium: 6,
  low: 2,
};

/** Turns what the analysis found into category scores and a health score. */
export type ScoringPolicy = (input: {
  measures: ProjectMeasures;
  findings: Finding[];
}) => { categoryScores: CategoryScores; healthScore: number };

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** Base score minus a linear, uncapped penalty per finding of the category. */
export function scoreFromIssues(
  base: number,
  issues: Finding[],
  category: IssueCategory,
): number {
  const penalty = issues
    .filter((issue) => issue.category === category)
    .reduce((sum, issue) => sum + SEVERITY_PENALTY[issue.severity], 0);
  return clampScore(base - penalty);
}

/**
 * Today's policy (v1): a base per category, adjusted by a few measures, minus
 * the linear penalty; the health score is the plain average. Phase 7 replaces
 * it (capped or diminishing penalty per rule), measured with an eval.
 */
export const linearPenaltyPolicy: ScoringPolicy = ({ measures, findings }) => {
  const categoryScores: CategoryScores = {
    architecture: scoreFromIssues(88, findings, "architecture"),
    security: scoreFromIssues(
      measures.secretHits.length > 0 ? 70 : 90,
      findings,
      "security",
    ),
    performance: scoreFromIssues(86, findings, "performance"),
    codeQuality: scoreFromIssues(
      measures.largeFiles.length + measures.complexFunctions.length > 8 ? 72 : 85,
      findings,
      "codeQuality",
    ),
    testing: scoreFromIssues(
      Math.max(40, measures.testedSourceApproxPercent),
      findings,
      "testing",
    ),
  };

  const healthScore = clampScore(
    (categoryScores.architecture +
      categoryScores.security +
      categoryScores.performance +
      categoryScores.codeQuality +
      categoryScores.testing) /
      5,
  );

  return { categoryScores, healthScore };
};
