import { DomainError } from "@/shared/errors";
import { logger } from "@/shared/logger";
import { and, asc, eq } from "drizzle-orm";

import { codeChunks, projects, reports, type StoredLlmReview } from "@/db/schema";
import { structuredLanguageModelId } from "@/lib/ai/llm";
import { loadProjectSourceFiles } from "@/lib/analysis/project-files";
import { reviewInputHash, runLlmHealthReview } from "@/lib/analysis/report-llm";
import type {
  CategoryScores,
  CategorySummaries,
  ReportIssue,
} from "@/lib/analysis/report-types";
import { db } from "@/lib/db";
import {
  buildReportFindings,
  computeDeterministicMetrics,
  diminishingPenaltyPolicy,
} from "@/modules/analysis";
import { assertLlmBudget, assertLlmEnabled, recordLlmCall } from "@/modules/billing/server";
import { setProjectStatus } from "@/modules/projects/server";
import { traced } from "@/shared/tracing";

export type GeneratedReport = {
  healthScore: number;
  categoryScores: CategoryScores;
  categorySummaries: CategorySummaries;
  issues: ReportIssue[];
  roadmap: ReportIssue[];
};

export type StageOptions = {
  /**
   * False while the workflow will still retry (ADR-005): a transient failure
   * is then not written to the project, so the progress page does not show
   * "failed" for a run that may still succeed. User errors (DomainError) are
   * final and always written.
   */
  finalAttempt?: boolean;
};

/**
 * Generate and persist the project health report. `userId` must come from the
 * server session; the project is only touched if it belongs to that user.
 */
export async function generateProjectReport(
  userId: string,
  projectId: string,
  { finalAttempt = true }: StageOptions = {},
): Promise<GeneratedReport> {
  const ownedProject = and(eq(projects.id, projectId), eq(projects.userId, userId));

  const [project] = await db
    .select({ name: projects.name, framework: projects.framework })
    .from(projects)
    .where(ownedProject)
    .limit(1);

  if (!project) {
    throw new Error("Project not found");
  }

  await setProjectStatus(userId, projectId, "processing", null);

  try {
    const files = await loadProjectSourceFiles(userId, projectId);
    const metrics = await traced("report.metrics", { files: files.length }, async () =>
      computeDeterministicMetrics(files),
    );

    const chunks = await db
      .select({
        filePath: codeChunks.filePath,
        content: codeChunks.content,
        startLine: codeChunks.startLine,
        endLine: codeChunks.endLine,
      })
      .from(codeChunks)
      .where(eq(codeChunks.projectId, projectId))
      // All of them: the reviewer's sample is spread over the whole project
      // (sampleForReview), not the first files in alphabetical order.
      .orderBy(asc(codeChunks.filePath), asc(codeChunks.startLine));

    if (chunks.length === 0) {
      throw new DomainError(
        "No code chunks available. Build project knowledge before generating a report.",
      );
    }

    // Same code as the stored review → same review (TD-43): the model's
    // answers vary between runs, so asking again could change the score with
    // no code change. The project's ownership was checked above.
    const reviewInput = { projectName: project.name, framework: project.framework, chunks };
    const inputHash = reviewInputHash(reviewInput);
    const [previous] = await db
      .select({ llmReview: reports.llmReview })
      .from(reports)
      .where(eq(reports.projectId, projectId))
      .limit(1);

    let llm: StoredLlmReview;
    if (previous?.llmReview?.inputHash === inputHash) {
      llm = previous.llmReview;
      logger.info("analysis.llm_review_reused", { userId, projectId });
    } else {
      // Here, not at the entry points: every path to a new review ends here.
      await assertLlmEnabled("report");
      await assertLlmBudget(userId);

      // Usage recorded on success and failure (Phase 4); recording never throws.
      const llmCall = { userId, projectId, feature: "report" as const, model: structuredLanguageModelId() };
      const llmStarted = performance.now();
      const review = await traced("report.llm_review", { chunks: chunks.length }, () =>
        runLlmHealthReview(reviewInput),
      ).catch(async (error: unknown) => {
        await recordLlmCall({ ...llmCall, usage: null, latencyMs: performance.now() - llmStarted, ok: false });
        throw error;
      });
      await recordLlmCall({ ...llmCall, usage: review.usage, latencyMs: performance.now() - llmStarted, ok: true });
      llm = {
        inputHash,
        architectureSummary: review.architectureSummary,
        securitySummary: review.securitySummary,
        performanceSummary: review.performanceSummary,
        issues: review.issues,
      };
    }

    // One finding per problem, most severe first (ADR-010).
    const issues = buildReportFindings(metrics.issues, llm.issues);

    const { categoryScores, healthScore } = diminishingPenaltyPolicy({
      measures: metrics,
      findings: issues,
    });

    const categorySummaries: CategorySummaries = {
      architecture: llm.architectureSummary,
      security: `${metrics.summaries.security} ${llm.securitySummary}`.trim(),
      performance: llm.performanceSummary,
      codeQuality: metrics.summaries.codeQuality,
      testing: metrics.summaries.testing,
    };

    const roadmap = issues.slice(0, 10);

    const reportData = {
      healthScore,
      categoryScores: {
        ...categoryScores,
        summaries: categorySummaries,
      },
      issues,
      llmReview: llm,
    };

    await db
      .insert(reports)
      .values({ projectId, ...reportData })
      .onConflictDoUpdate({ target: reports.projectId, set: reportData });

    await setProjectStatus(userId, projectId, "completed", null);

    return {
      healthScore,
      categoryScores,
      categorySummaries,
      issues,
      roadmap,
    };
  } catch (error) {
    // errorMessage is shown to the user: a DomainError explains the problem;
    // raw errors (LLM provider, DB) may carry internals, so they become a
    // generic message (TD-33).
    const isDomain = error instanceof DomainError;
    if (!isDomain && !finalAttempt) {
      logger.warn("analysis.report_retrying", { err: error, userId, projectId });
      throw error;
    }
    if (isDomain) {
      logger.warn("analysis.report_rejected", { err: error, userId, projectId });
    } else {
      logger.error("analysis.report_failed", { err: error, userId, projectId });
    }
    await setProjectStatus(
      userId,
      projectId,
      "failed",
      isDomain ? error.message : "Failed to generate health report.",
    );
    throw error;
  }
}
