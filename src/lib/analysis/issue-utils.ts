import type {
  IssueCategory,
  IssueSeverity,
  ReportIssue,
} from "@/lib/analysis/report-types";
import { SEVERITY_ORDER } from "@/lib/analysis/report-types";

export const CATEGORY_LABELS: Record<IssueCategory, string> = {
  architecture: "Architecture",
  security: "Security",
  performance: "Performance",
  codeQuality: "Code Quality",
  testing: "Testing",
};

export const SEVERITY_LABELS: Record<IssueSeverity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

export const ALL_CATEGORIES = Object.keys(CATEGORY_LABELS) as IssueCategory[];
export const ALL_SEVERITIES = Object.keys(SEVERITY_LABELS) as IssueSeverity[];

// One ladder for every severity UI: critical dark red, high orange, medium
// mustard, low grey. `color` tints icons/diamonds, `badge` is the label
// (border = text color, light tinted fill), `accent` the left rule on issue
// cards. The actual colors live in one place: the `.ca-sev-*` classes in globals.css
// set `--ca-sev` per severity (and per theme); these utilities only read it,
// so the diamond, icon, badge and left rule can't drift apart.
export const SEVERITY_STYLES = Object.fromEntries(
  ALL_SEVERITIES.map((severity) => [
    severity,
    {
      color: `ca-sev-${severity} text-(--ca-sev)`,
      badge: `ca-sev-${severity} border-current bg-(--ca-sev)/5 text-(--ca-sev)`,
      // 2px rule at 70% so it reads as light as the badge's 1px border.
      accent: `ca-sev-${severity} border-l-(--ca-sev)/70 bg-(--ca-sev)/4`,
    },
  ]),
) as Record<IssueSeverity, { color: string; badge: string; accent: string }>;

export function sortIssues(issues: ReportIssue[]): ReportIssue[] {
  return [...issues].sort((a, b) => {
    const severityDiff =
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (severityDiff !== 0) return severityDiff;
    return a.category.localeCompare(b.category);
  });
}

export function filterIssues(
  issues: ReportIssue[],
  options: {
    severity?: IssueSeverity | "all";
    category?: IssueCategory | "all";
  },
): ReportIssue[] {
  return sortIssues(issues).filter((issue) => {
    if (
      options.severity &&
      options.severity !== "all" &&
      issue.severity !== options.severity
    ) {
      return false;
    }
    if (
      options.category &&
      options.category !== "all" &&
      issue.category !== options.category
    ) {
      return false;
    }
    return true;
  });
}

export function countBySeverity(issues: ReportIssue[]) {
  return ALL_SEVERITIES.reduce(
    (acc, severity) => {
      acc[severity] = issues.filter(
        (issue) => issue.severity === severity,
      ).length;
      return acc;
    },
    {} as Record<IssueSeverity, number>,
  );
}
