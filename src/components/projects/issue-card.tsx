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
// severity-colored left rule + icon + badges, files linked to the explorer,
// with the lines the evidence points to.
// A grouped finding (ADR-010) lists each occurrence.
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
      {issue.occurrences?.length ? (
        <ul className="mt-2 space-y-1">
          {issue.occurrences.map((occurrence, index) => (
            <li key={`${occurrence.filePath}-${index}`} className="text-xs text-(--ca-muted)">
              <FileRef filePath={occurrence.filePath} projectId={projectId} />
              <span> — {occurrence.title}</span>
            </li>
          ))}
        </ul>
      ) : issue.filePath ? (
        <div className="mt-2">
          <FileRef filePath={issue.filePath} projectId={projectId} />
          {issue.evidence ? (
            <span className="font-mono text-xs text-(--ca-muted)">
              :{issue.evidence.startLine}
              {issue.evidence.endLine > issue.evidence.startLine
                ? `-${issue.evidence.endLine}`
                : ""}
            </span>
          ) : null}
        </div>
      ) : (
        <p className="mt-2 font-mono text-xs text-(--ca-muted)">
          Project-wide finding
        </p>
      )}
    </div>
  );
}

/** A file of a finding: linked to the explorer for the owner, plain text in public. */
function FileRef({ filePath, projectId }: { filePath: string | null; projectId?: string }) {
  if (!filePath) return <span className="font-mono text-xs">Project-wide</span>;
  if (!projectId) {
    return <span className="font-mono text-xs break-all text-(--ca-muted)">{filePath}</span>;
  }
  return (
    <Link
      href={`/projects/${projectId}/explorer?file=${encodeURIComponent(filePath)}`}
      className="font-mono text-xs break-all text-(--ca-muted) underline-offset-4 hover:text-(--ca-ink) hover:underline"
    >
      {filePath}
    </Link>
  );
}
