import {
  countBySeverity,
  filterIssues,
  SEVERITY_STYLES,
  sortIssues,
} from "@/lib/analysis/issue-utils";
import type { ReportIssue } from "@/lib/analysis/report-types";
import { describe, expect, it } from "vitest";

const issues: ReportIssue[] = [
  {
    title: "Low issue",
    description: "d",
    severity: "low",
    category: "testing",
    filePath: null,
  },
  {
    title: "Critical security",
    description: "d",
    severity: "critical",
    category: "security",
    filePath: "a.ts",
  },
  {
    title: "Medium arch",
    description: "d",
    severity: "medium",
    category: "architecture",
    filePath: "b.ts",
  },
  {
    title: "High quality",
    description: "d",
    severity: "high",
    category: "codeQuality",
    filePath: "c.ts",
  },
];

describe("sortIssues", () => {
  it("orders by severity then category", () => {
    const sorted = sortIssues(issues);
    expect(sorted.map((i) => i.severity)).toEqual([
      "critical",
      "high",
      "medium",
      "low",
    ]);
  });
});

describe("filterIssues", () => {
  it("filters by severity", () => {
    const filtered = filterIssues(issues, { severity: "critical" });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.title).toBe("Critical security");
  });

  it("filters by category", () => {
    const filtered = filterIssues(issues, { category: "architecture" });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.title).toBe("Medium arch");
  });

  it("returns all when filters are all", () => {
    expect(
      filterIssues(issues, { severity: "all", category: "all" }),
    ).toHaveLength(4);
  });
});

describe("countBySeverity / SEVERITY_STYLES", () => {
  it("counts severities", () => {
    expect(countBySeverity(issues)).toEqual({
      critical: 1,
      high: 1,
      medium: 1,
      low: 1,
    });
  });

  it("maps each severity to its ca-sev class", () => {
    for (const severity of ["critical", "high", "medium", "low"] as const) {
      const styles = SEVERITY_STYLES[severity];
      expect(styles.color).toContain(`ca-sev-${severity}`);
      expect(styles.badge).toContain(`ca-sev-${severity}`);
      expect(styles.accent).toContain(`ca-sev-${severity}`);
    }
  });
});
