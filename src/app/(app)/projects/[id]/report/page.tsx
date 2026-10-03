import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import {
  GenerateReportButton,
  RetryFullAnalysisButton,
} from "@/components/projects/report-actions";
import { ReportView } from "@/components/projects/report-view";
import { ShareReportDialog } from "@/components/projects/share-report-dialog";
import { ActionAlert } from "@/components/shared/action-alert";
import type {
  AiReviewSkip,
  CategoryScores,
  CategorySummaries,
  ReportIssue,
} from "@/lib/analysis/report-types";
import { auth } from "@/lib/auth";
import { getProjectReport, getReportShareState } from "@/modules/projects/server";

type PageProps = {
  params: Promise<{ id: string }>;
};

type StoredCategoryScores = CategoryScores & {
  summaries?: CategorySummaries;
  aiReviewSkipped?: AiReviewSkip;
};

export default async function ProjectReportPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id } = await params;
  // A malformed id would make Postgres throw; treat it as not found.
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) notFound();

  const project = await getProjectReport(session.user.id, parsedId.data);

  if (!project) notFound();

  const hasChunks = project.hasChunks;

  const report = project.report;
  const categoryScores = (report?.categoryScores ??
    null) as StoredCategoryScores | null;
  const share = report ? await getReportShareState(session.user.id, project.id) : null;

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
            <ReportView
              healthScore={report.healthScore}
              categoryScores={categoryScores}
              summaries={categoryScores?.summaries}
              issues={(report.issues ?? []) as ReportIssue[]}
              projectId={project.id}
              aiReviewSkipped={categoryScores?.aiReviewSkipped}
            />

            <div className="ca-panel flex flex-wrap items-center gap-3 p-4">
              <RetryFullAnalysisButton projectId={project.id} primary />
              <ShareReportDialog
                projectId={project.id}
                share={
                  share?.active
                    ? { expiresAt: share.expiresAt?.toISOString() ?? null }
                    : null
                }
              />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
