/** What the analysis reports about a project. Pure (also used by the UI). */

export type IssueSeverity = "critical" | "high" | "medium" | "low";

export type IssueCategory =
  | "architecture"
  | "security"
  | "performance"
  | "codeQuality"
  | "testing";

/**
 * Where in the code a finding comes from. Optional: today no rule or LLM
 * review fills it; Phase 7 requires it for high/critical findings.
 */
export type Evidence = {
  startLine: number;
  endLine: number;
  snippet?: string;
};

export type Finding = {
  title: string;
  description: string;
  severity: IssueSeverity;
  category: IssueCategory;
  filePath: string | null;
  evidence?: Evidence;
};

export const SEVERITY_ORDER: Record<IssueSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/** Most severe first, then by category. */
export function sortFindings<T extends Finding>(findings: T[]): T[] {
  return [...findings].sort((a, b) => {
    const severityDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (severityDiff !== 0) return severityDiff;
    return a.category.localeCompare(b.category);
  });
}
