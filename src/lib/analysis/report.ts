import { DomainError } from "@/shared/errors";
import { logger } from "@/shared/logger";
import { and, asc, eq } from "drizzle-orm";

import { codeChunks, projects, reports } from "@/db/schema";
import { structuredLanguageModelId } from "@/lib/ai/llm";
import { loadProjectSourceFiles } from "@/lib/analysis/project-files";
import { runLlmHealthReview } from "@/lib/analysis/report-llm";
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
import { assertLlmBudget, recordLlmCall } from "@/modules/billing/server";
import { setProjectStatus } from "@/modules/projects/server";

export type GeneratedReport = {
  healthScore: number;
  categoryScores: CategoryScores;
  categorySummaries: CategorySummaries;
  issues: ReportIssue[];
  roadmap: ReportIssue[];
};

/**
 * Generate and persist the project health report. `userId` must come from the
 * server session; the project is only touched if it belongs to that user.
 */
export async function generateProjectReport(
  userId: string,
  projectId: string,
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
    const metrics = computeDeterministicMetrics(files);

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

    // Here, not at the entry points: every path to a report ends in this call.
    await assertLlmBudget(userId);

    // Usage recorded on success and failure (Phase 4); recording never throws.
    const llmCall = { userId, projectId, feature: "report" as const, model: structuredLanguageModelId() };
    const llmStarted = performance.now();
    const llm = await runLlmHealthReview({
      projectName: project.name,
      framework: project.framework,
      chunks,
    }).catch(async (error: unknown) => {
      await recordLlmCall({ ...llmCall, usage: null, latencyMs: performance.now() - llmStarted, ok: false });
      throw error;
    });
    await recordLlmCall({ ...llmCall, usage: llm.usage, latencyMs: performance.now() - llmStarted, ok: true });

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
