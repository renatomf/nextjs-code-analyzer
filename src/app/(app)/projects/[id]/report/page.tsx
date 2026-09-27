import { and, eq } from "drizzle-orm";
import {
  Code2,
  FlaskConical,
  Gauge,
  Layers,
  Shield,
} from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ComponentType } from "react";
import { z } from "zod";

import {
  GenerateReportButton,
  RetryFullAnalysisButton,
} from "@/components/projects/report-actions";
import { IssueCard } from "@/components/projects/issue-card";
import { ActionAlert } from "@/components/shared/action-alert";
import { Button } from "@/components/ui/button";
import { codeChunks, projects } from "@/db/schema";
import {
  CATEGORY_LABELS,
  SEVERITY_LABELS,
  sortIssues,
} from "@/lib/analysis/issue-utils";
import type {
  CategoryScores,
  CategorySummaries,
  IssueCategory,
  ReportIssue,
} from "@/lib/analysis/report-types";
import {
  CATEGORY_ACCENT,
  scoreBarClass,
  scoreChipClass,
  scoreLabel,
  scoreTextClass,
  scoreTone,
} from "@/lib/analysis/score-ui";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { cn } from "@/lib/utils";

type PageProps = {
  params: Promise<{ id: string }>;
};

type StoredCategoryScores = CategoryScores & {
  summaries?: CategorySummaries;
};

const CATEGORY_ICONS: Record<
  IssueCategory,
  ComponentType<{ className?: string }>
> = {
  architecture: Layers,
  security: Shield,
  performance: Gauge,
  codeQuality: Code2,
  testing: FlaskConical,
};

export default async function ProjectReportPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id } = await params;
  // A malformed id would make Postgres throw; treat it as not found.
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) notFound();

  const project = await db.query.projects.findFirst({
    where: and(
      eq(projects.id, parsedId.data),
      eq(projects.userId, session.user.id),
    ),
    columns: { id: true, name: true, errorMessage: true },
    with: { report: true },
  });

  if (!project) notFound();

  const [chunk] = await db
    .select({ id: codeChunks.id })
    .from(codeChunks)
    .where(eq(codeChunks.projectId, project.id))
    .limit(1);
  const hasChunks = Boolean(chunk);

  const report = project.report;
  const categoryScores = (report?.categoryScores ??
    null) as StoredCategoryScores | null;
  const summaries = categoryScores?.summaries;
  const issues = sortIssues((report?.issues ?? []) as ReportIssue[]);
  const roadmap = issues.slice(0, 8);
  const previewIssues = issues.slice(0, 5);
  const overallTone = scoreTone(report?.healthScore);

  return (
    <main className="flex-1">
      <div className="ca-container py-10">
        {!report ? (
          <section className="ca-panel flex flex-col items-start gap-4 p-8">
            <span className="ca-diamond text-(--ca-green-deep)" aria-hidden />
            <h2 className="ca-title text-3xl">
              <span className="ca-dim">No report</span> yet
            </h2>
            <p className="max-w-md text-sm leading-relaxed text-(--ca-muted)">
              {hasChunks
                ? "Code knowledge exists. Generate the health report to see scores and issues."
                : "Build code knowledge first, then generate a health report."}
            </p>
            <div className="mt-2">
              {project.errorMessage ? (
                <ActionAlert
                  title="Last analysis reported"
                  message={project.errorMessage}
                  className="mb-3"
                />
              ) : null}
              {hasChunks ? (
                <GenerateReportButton projectId={project.id} />
              ) : (
                <RetryFullAnalysisButton projectId={project.id} />
              )}
            </div>
          </section>
        ) : (
          <div className="flex flex-col gap-6">
            {/* Hero score */}
            <section className="ca-panel p-6 sm:p-8">
              <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="ca-kicker">Project health</p>
                  <div className="mt-4 flex flex-wrap items-end gap-3">
                    <p
                      className={cn(
                        "ca-title text-7xl tabular-nums sm:text-8xl",
                        scoreTextClass(overallTone),
                      )}
                    >
                      {report.healthScore}
                    </p>
                    <span className="pb-2 text-lg text-(--ca-soft)">/ 100</span>
                    <span
                      className={cn(
                        "mb-2 inline-flex border px-2.5 py-1 font-mono text-[0.68rem] tracking-[0.04em] uppercase",
                        scoreChipClass(overallTone),
                      )}
                    >
                      {scoreLabel(overallTone)}
                    </span>
                  </div>
                  <p className="mt-3 max-w-md text-sm leading-relaxed text-(--ca-muted)">
                    Average of five category scores. Use the roadmap below to
                    decide what to fix first.
                  </p>
                  <div className="mt-5 h-1.5 max-w-md overflow-hidden bg-(--ca-line)">
                    <div
                      className={cn(
                        "h-full transition-all",
                        scoreBarClass(overallTone),
                      )}
                      style={{
                        width: `${Math.min(100, Math.max(0, report.healthScore))}%`,
                      }}
                    />
                  </div>
                </div>

                <div className="grid min-w-0 flex-1 grid-cols-2 gap-3 sm:grid-cols-3 lg:max-w-xl">
                  {(Object.keys(CATEGORY_LABELS) as IssueCategory[]).map(
                    (key) => {
                      const score = categoryScores?.[key];
                      const tone = scoreTone(score);
                      const Icon = CATEGORY_ICONS[key];
                      return (
                        <div
                          key={key}
                          className={cn(
                            "border p-3",
                            CATEGORY_ACCENT[key].soft,
                          )}
                        >
                          <div className="flex items-center gap-1.5 text-(--ca-muted)">
                            <Icon className="size-3.5" aria-hidden />
                            <p className="font-mono text-[0.68rem] tracking-[0.04em] uppercase">
                              {CATEGORY_LABELS[key]}
                            </p>
                          </div>
                          <p
                            className={cn(
                              "mt-2 text-2xl font-bold tabular-nums",
                              scoreTextClass(tone),
                            )}
                          >
                            {score ?? "—"}
                          </p>
                          <div className="mt-2 h-1 overflow-hidden bg-(--ca-line)">
                            <div
                              className={cn("h-full", scoreBarClass(tone))}
                              style={{
                                width: `${Math.min(100, Math.max(0, score ?? 0))}%`,
                                opacity: score == null ? 0.25 : 1,
                              }}
                            />
                          </div>
                        </div>
                      );
                    },
                  )}
                </div>
              </div>
            </section>

            {/* Category summaries */}
            <section className="grid gap-4">
              {(Object.keys(CATEGORY_LABELS) as IssueCategory[]).map((key) => {
                const score = categoryScores?.[key];
                const tone = scoreTone(score);
                const Icon = CATEGORY_ICONS[key];
                return (
                  <article
                    key={key}
                    className="ca-panel p-0"
                  >
                    <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:gap-6">
                      <div
                        className={cn(
                          "flex size-11 shrink-0 items-center justify-center border",
                          CATEGORY_ACCENT[key].soft,
                        )}
                      >
                        <Icon
                          className="size-5 text-foreground/80"
                          aria-hidden
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="ca-title text-xl">
                            {CATEGORY_LABELS[key]}
                          </h2>
                          <span
                            className={cn(
                              "inline-flex border px-2 py-0.5 font-mono text-xs tabular-nums",
                              scoreChipClass(tone),
                            )}
                          >
                            {score ?? "—"}/100
                          </span>
                        </div>
                        <p className="mt-2 text-[15px] leading-relaxed text-foreground/80">
                          {summaries?.[key] ?? "No summary available."}
                        </p>
                      </div>
                    </div>
                    <div
                      className={cn("h-0.5 w-full", CATEGORY_ACCENT[key].bar)}
                      style={{
                        opacity: 0.55,
                      }}
                    />
                  </article>
                );
              })}
            </section>

            {/* Roadmap */}
            <section className="ca-panel p-5 sm:p-6">
              <p className="ca-kicker">Next steps</p>
              <h2 className="ca-title mt-4 text-3xl">
                <span className="ca-dim">Improvement</span> roadmap
              </h2>
              <p className="mt-1 text-sm text-(--ca-muted)">
                Priority-ordered recommendations. No time estimates.
              </p>
              {roadmap.length === 0 ? (
                <p className="mt-5 text-sm text-(--ca-muted)">
                  No prioritized issues were generated.
                </p>
              ) : (
                <ol className="mt-5 space-y-3">
                  {roadmap.map((issue, index) => (
                    <li
                      key={`${issue.title}-${index}`}
                      className="flex gap-3 rounded-[0.375rem] border border-(--ca-line) p-3.5"
                    >
                      <span className="flex size-7 shrink-0 items-center justify-center bg-(--ca-green) font-mono text-xs font-bold text-[#050505]">
                        {index + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="font-medium tracking-tight">
                          {issue.title}
                        </p>
                        <p className="mt-1 text-xs text-(--ca-muted)">
                          {CATEGORY_LABELS[issue.category]} ·{" "}
                          {SEVERITY_LABELS[issue.severity]}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            {/* Top issues */}
            <section className="ca-panel p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="ca-kicker">Findings</p>
                  <h2 className="ca-title mt-4 text-3xl">
                    <span className="ca-dim">Top</span> issues
                  </h2>
                  <p className="mt-1 text-sm text-(--ca-muted)">
                    {issues.length} potential issue
                    {issues.length === 1 ? "" : "s"} across all categories.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  nativeButton={false}
                  render={<Link href={`/projects/${project.id}/issues`} />}
                  mint
                >
                  View all
                </Button>
              </div>

              <div className="mt-5 space-y-3">
                {previewIssues.length === 0 ? (
                  <p className="text-sm text-(--ca-muted)">
                    No issues were flagged.
                  </p>
                ) : (
                  previewIssues.map((issue, index) => (
                    <IssueCard
                      key={`${issue.title}-${index}`}
                      issue={issue}
                      projectId={project.id}
                    />
                  ))
                )}
              </div>
            </section>

            <div className="ca-panel flex flex-wrap items-center gap-3 p-4">
              <RetryFullAnalysisButton projectId={project.id} primary />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
