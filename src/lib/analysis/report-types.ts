export type IssueSeverity = "critical" | "high" | "medium" | "low";

export type IssueCategory =
  | "architecture"
  | "security"
  | "performance"
  | "codeQuality"
  | "testing";

export type ReportIssue = {
  title: string;
  description: string;
  severity: IssueSeverity;
  category: IssueCategory;
  filePath: string | null;
};

export type CategoryScores = {
  architecture: number;
  security: number;
  performance: number;
  codeQuality: number;
  testing: number;
};

export type CategorySummaries = {
  architecture: string;
  security: string;
  performance: string;
  codeQuality: string;
  testing: string;
};

export const SEVERITY_ORDER: Record<IssueSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export const SEVERITY_PENALTY: Record<IssueSeverity, number> = {
  critical: 20,
  high: 12,
  medium: 6,
  low: 2,
};
