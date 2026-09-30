import { AlertTriangle } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  CATEGORY_LABELS,
  SEVERITY_LABELS,
  SEVERITY_STYLES,
} from "@/lib/analysis/issue-utils";
import type { ReportIssue } from "@/lib/analysis/report-types";
import { cn } from "@/lib/utils";

// One issue card for every list (report "Top issues" and the Issues page):
// severity-colored left rule + icon + badges, file linked to the explorer.
// No hooks, so it renders from both server and client components.
// Without `projectId` (public shared report) the file is plain text.
export function IssueCard({
  issue,
  projectId,
}: {
  issue: ReportIssue;
  projectId?: string;
}) {
  const styles = SEVERITY_STYLES[issue.severity];

  return (
    <div
      className={cn(
        "rounded-[0.375rem] border border-l-2 border-(--ca-line) p-4 text-sm",
        styles.accent,
      )}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <AlertTriangle className={cn("size-3.5", styles.color)} aria-hidden />
        <p className="font-medium tracking-tight">{issue.title}</p>
        <Badge variant="outline" className={styles.badge}>
          {SEVERITY_LABELS[issue.severity]}
        </Badge>
        <Badge variant="outline">{CATEGORY_LABELS[issue.category]}</Badge>
      </div>
      <p className="leading-relaxed text-foreground/75">{issue.description}</p>
      {issue.filePath && !projectId ? (
        <p className="mt-2 font-mono text-xs break-all text-(--ca-muted)">
          {issue.filePath}
        </p>
      ) : issue.filePath ? (
        <Link
          href={`/projects/${projectId}/explorer?file=${encodeURIComponent(issue.filePath)}`}
          className="mt-2 inline-block font-mono text-xs break-all text-(--ca-muted) underline-offset-4 hover:text-(--ca-ink) hover:underline"
        >
          {issue.filePath}
        </Link>
      ) : (
        <p className="mt-2 font-mono text-xs text-(--ca-muted)">
          Project-wide finding
        </p>
      )}
    </div>
  );
}
