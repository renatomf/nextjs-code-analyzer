"use client";

import { IssueCard } from "@/components/projects/issue-card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ALL_CATEGORIES,
  ALL_SEVERITIES,
  CATEGORY_LABELS,
  SEVERITY_LABELS,
  SEVERITY_STYLES,
  countBySeverity,
  filterIssues,
} from "@/lib/analysis/issue-utils";
import type {
  IssueCategory,
  IssueSeverity,
  ReportIssue,
} from "@/lib/analysis/report-types";
import { useMemo, useState } from "react";

type SeverityFilter = IssueSeverity | "all";
type CategoryFilter = IssueCategory | "all";

// value → label maps so the Select trigger shows the label, not the raw value.
const SEVERITY_ITEMS = { all: "All severities", ...SEVERITY_LABELS };
const CATEGORY_ITEMS = { all: "All categories", ...CATEGORY_LABELS };

export function IssuesDashboard({
  projectId,
  issues,
}: {
  projectId: string;
  issues: ReportIssue[];
}) {
  const [severity, setSeverity] = useState<SeverityFilter>("all");
  const [category, setCategory] = useState<CategoryFilter>("all");

  const filtered = useMemo(
    () => filterIssues(issues, { severity, category }),
    [issues, severity, category],
  );

  const severityCounts = useMemo(() => countBySeverity(issues), [issues]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {ALL_SEVERITIES.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() =>
              setSeverity((current) => (current === value ? "all" : value))
            }
            aria-pressed={severity === value}
            // Active: same look as the severity badge on the issue items.
            className={`inline-flex items-center gap-2 border px-3 py-1 font-mono text-[0.68rem] tracking-[0.04em] uppercase transition-colors ${
              severity === value
                ? SEVERITY_STYLES[value].badge
                : "border-(--ca-line) text-(--ca-muted) hover:text-(--ca-ink)"
            }`}
          >
            <span
              className={`ca-diamond ${SEVERITY_STYLES[value].color}`}
              aria-hidden
            />
            {SEVERITY_LABELS[value]} ({severityCounts[value]})
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="severity-filter">Severity</Label>
          <Select
            items={SEVERITY_ITEMS}
            value={severity}
            onValueChange={(value) => setSeverity(value as SeverityFilter)}
          >
            <SelectTrigger id="severity-filter" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{SEVERITY_ITEMS.all}</SelectItem>
              {ALL_SEVERITIES.map((value) => (
                <SelectItem key={value} value={value}>
                  {SEVERITY_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="category-filter">Category</Label>
          <Select
            items={CATEGORY_ITEMS}
            value={category}
            onValueChange={(value) => setCategory(value as CategoryFilter)}
          >
            <SelectTrigger id="category-filter" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{CATEGORY_ITEMS.all}</SelectItem>
              {ALL_CATEGORIES.map((value) => (
                <SelectItem key={value} value={value}>
                  {CATEGORY_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <p className="text-sm text-(--ca-muted)">
        Showing {filtered.length} of {issues.length} issue(s). These are
        potential findings to review, not certified vulnerabilities.
      </p>

      {filtered.length === 0 ? (
        <div className="ca-panel p-8 text-center text-sm text-(--ca-muted)">
          No issues match the current filters.
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((issue, index) => (
            <li key={`${issue.title}-${issue.filePath}-${index}`}>
              <IssueCard issue={issue} projectId={projectId} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
