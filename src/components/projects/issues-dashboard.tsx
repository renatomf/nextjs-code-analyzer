"use client";

import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  ALL_CATEGORIES,
  ALL_SEVERITIES,
  CATEGORY_LABELS,
  SEVERITY_LABELS,
  countBySeverity,
  filterIssues,
  severityVariant,
} from "@/lib/analysis/issue-utils";
import type {
  IssueCategory,
  IssueSeverity,
  ReportIssue,
} from "@/lib/analysis/report-types";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

type SeverityFilter = IssueSeverity | "all";
type CategoryFilter = IssueCategory | "all";

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
            className={`border px-3 py-1 font-mono text-[0.68rem] tracking-[0.04em] uppercase transition-colors ${
              severity === value
                ? "border-(--ca-ink) bg-(--ca-ink) text-background"
                : "border-(--ca-line) text-(--ca-muted) hover:text-(--ca-ink)"
            }`}
          >
            {SEVERITY_LABELS[value]} ({severityCounts[value]})
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="severity-filter">Severity</Label>
          <div className="relative">
            <select
              id="severity-filter"
              className="h-11 w-full appearance-none rounded-none bg-(--ca-card) pr-11 pl-3.5 text-sm text-(--ca-ink) shadow-[inset_0_0_0_1px_var(--ca-line)] transition-shadow outline-none hover:shadow-[inset_0_0_0_1px_var(--ca-soft)] focus-visible:shadow-[inset_0_0_0_1px_var(--ca-ink)]"
              value={severity}
              onChange={(event) =>
                setSeverity(event.target.value as SeverityFilter)
              }
            >
              <option value="all">All severities</option>
              {ALL_SEVERITIES.map((value) => (
                <option key={value} value={value}>
                  {SEVERITY_LABELS[value]}
                </option>
              ))}
            </select>
            <ChevronDown
              className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-(--ca-muted)"
              aria-hidden
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="category-filter">Category</Label>
          <div className="relative">
            <select
              id="category-filter"
              className="h-11 w-full appearance-none rounded-none bg-(--ca-card) pr-11 pl-3.5 text-sm text-(--ca-ink) shadow-[inset_0_0_0_1px_var(--ca-line)] transition-shadow outline-none hover:shadow-[inset_0_0_0_1px_var(--ca-soft)] focus-visible:shadow-[inset_0_0_0_1px_var(--ca-ink)]"
              value={category}
              onChange={(event) =>
                setCategory(event.target.value as CategoryFilter)
              }
            >
              <option value="all">All categories</option>
              {ALL_CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {CATEGORY_LABELS[value]}
                </option>
              ))}
            </select>
            <ChevronDown
              className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-(--ca-muted)"
              aria-hidden
            />
          </div>
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
            <li
              key={`${issue.title}-${issue.filePath}-${index}`}
              className="ca-panel p-4"
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <h2 className="font-medium tracking-tight">{issue.title}</h2>
                <Badge variant={severityVariant(issue.severity)}>
                  {SEVERITY_LABELS[issue.severity]}
                </Badge>
                <Badge variant="outline">
                  {CATEGORY_LABELS[issue.category]}
                </Badge>
              </div>
              <p className="text-sm text-(--ca-muted)">
                {issue.description}
              </p>
              {issue.filePath ? (
                <p className="mt-2 text-xs text-(--ca-muted)">
                  File:{" "}
                  <Link
                    href={`/projects/${projectId}/explorer?file=${encodeURIComponent(issue.filePath)}`}
                    className="font-mono text-(--ca-ink) underline-offset-4 hover:underline"
                  >
                    {issue.filePath}
                  </Link>
                </p>
              ) : (
                <p className="mt-2 text-xs text-(--ca-muted)">
                  Project-wide finding
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
