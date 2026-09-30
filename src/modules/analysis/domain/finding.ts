/** What the analysis reports about a project. Pure (also used by the UI). */

export type IssueSeverity = "critical" | "high" | "medium" | "low";

export type IssueCategory =
  | "architecture"
  | "security"
  | "performance"
  | "codeQuality"
  | "testing";

/**
 * Where in the code a finding comes from. The LLM review fills it for every
 * finding about a file (verifyEvidence); the deterministic rules do not yet.
 * Public report links get the lines only, never the snippet.
 */
export type Evidence = {
  startLine: number;
  endLine: number;
  snippet?: string;
};

/** One place where a grouped finding occurs, with its own details. */
export type Occurrence = {
  filePath: string | null;
  severity: IssueSeverity;
  title: string;
  description: string;
};

export type Finding = {
  title: string;
  description: string;
  severity: IssueSeverity;
  category: IssueCategory;
  filePath: string | null;
  evidence?: Evidence;
  /** Id of the deterministic rule that produced it (none for the LLM). */
  rule?: string;
  /**
   * Set when the same problem was found in several places (ADR-010): the
   * finding stands for all of them, the most severe first. `filePath` is the
   * first occurrence's.
   */
  occurrences?: Occurrence[];
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
