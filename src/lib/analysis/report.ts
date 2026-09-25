import { and, asc, eq } from "drizzle-orm";

import { codeChunks, projects, reports } from "@/db/schema";
import { computeDeterministicMetrics } from "@/lib/analysis/metrics";
import { loadProjectSourceFiles } from "@/lib/analysis/project-files";
import { runLlmHealthReview } from "@/lib/analysis/report-llm";
import {
  SEVERITY_ORDER,
  SEVERITY_PENALTY,
  type CategoryScores,
  type CategorySummaries,
  type ReportIssue,
} from "@/lib/analysis/report-types";
import { db } from "@/lib/db";

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function scoreFromIssues(
  base: number,
  issues: ReportIssue[],
  category: ReportIssue["category"],
): number {
  const penalty = issues
    .filter((issue) => issue.category === category)
    .reduce((sum, issue) => sum + SEVERITY_PENALTY[issue.severity], 0);
  return clampScore(base - penalty);
}

function sortIssues(issues: ReportIssue[]): ReportIssue[] {
  return [...issues].sort((a, b) => {
    const severityDiff =
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (severityDiff !== 0) return severityDiff;
    return a.category.localeCompare(b.category);
  });
}

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

  await db
    .update(projects)
    .set({ status: "processing", errorMessage: null })
    .where(ownedProject);

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
      .orderBy(asc(codeChunks.filePath), asc(codeChunks.startLine))
      .limit(80);

    if (chunks.length === 0) {
      throw new Error(
        "No code chunks available. Build project knowledge before generating a report.",
      );
    }

    const llm = await runLlmHealthReview({
      projectName: project.name,
      framework: project.framework,
      chunks,
    });

    const issues = sortIssues([...metrics.issues, ...llm.issues]);

    const categoryScores: CategoryScores = {
      architecture: scoreFromIssues(88, issues, "architecture"),
      security: scoreFromIssues(
        metrics.secretHits.length > 0 ? 70 : 90,
        issues,
        "security",
      ),
      performance: scoreFromIssues(86, issues, "performance"),
      codeQuality: scoreFromIssues(
        metrics.largeFiles.length + metrics.complexFunctions.length > 8
          ? 72
          : 85,
        issues,
        "codeQuality",
      ),
      testing: scoreFromIssues(
        Math.max(40, metrics.testedSourceApproxPercent),
        issues,
        "testing",
      ),
    };

    const healthScore = clampScore(
      (categoryScores.architecture +
        categoryScores.security +
        categoryScores.performance +
        categoryScores.codeQuality +
        categoryScores.testing) /
        5,
    );

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

    await db
      .update(projects)
      .set({ status: "completed", errorMessage: null })
      .where(ownedProject);

    return {
      healthScore,
      categoryScores,
      categorySummaries,
      issues,
      roadmap,
    };
  } catch (error) {
    // errorMessage is shown to the user: raw errors (LLM provider, DB) may
    // carry internals, so only a generic message is stored.
    console.error("Failed to generate health report");
    await db
      .update(projects)
      .set({
        status: "failed",
        errorMessage: "Failed to generate health report.",
      })
      .where(ownedProject);
    throw error;
  }
}
