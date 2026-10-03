import "server-only";

import { getRun, start } from "workflow/api";

import { refundAnalysisUsage } from "@/modules/billing/server";
import type { AnalysisRunStatus } from "@/modules/projects";
import { failRunningAnalysis, setAnalysisRunId } from "@/modules/projects/server";
import { logger } from "@/shared/logger";

import { analysisWorkflow, type AnalysisRunOptions } from "./analysis-workflow";

/**
 * Starts the analysis workflow (ADR-005) and returns at once; the steps
 * write their progress to the project. Only ids and flags are passed: the
 * run's arguments are stored by Workflow. `userId` must come from the session.
 */
export async function enqueueAnalysis(
  userId: string,
  projectId: string,
  options: AnalysisRunOptions = {},
): Promise<string> {
  const run = await start(analysisWorkflow, [userId, projectId, options]);
  return run.runId;
}

/**
 * For callers that already own a "processing" project (a GitHub import or
 * re-analysis): starts its run and records it. If the run cannot start, the
 * project is failed at once and a new import's quota is given back (our
 * side, ADR-003). False when not started.
 */
export async function startAnalysisRun(
  userId: string,
  projectId: string,
  options: AnalysisRunOptions = {},
): Promise<boolean> {
  let runId: string;
  try {
    runId = await enqueueAnalysis(userId, projectId, options);
  } catch (error) {
    logger.error("analysis.enqueue_failed", { err: error, projectId });
    await failRunningAnalysis(userId, projectId, "Failed to start the analysis. Please try again.").catch(
      (releaseError: unknown) => logger.error("analysis.release_failed", { err: releaseError, projectId }),
    );
    if (options.importUsageId) {
      await refundAnalysisUsage(userId, options.importUsageId).catch((refundError: unknown) =>
        logger.error("billing.refund_failed", { err: refundError, projectId }),
      );
    }
    return false;
  }
  // The run is already going: failing to record its id must not fail it.
  await setAnalysisRunId(userId, projectId, runId).catch((error: unknown) => {
    logger.warn("analysis.run_id_not_saved", { err: error, projectId, runId });
  });
  return true;
}

/**
 * Status of the run that owns a project, or null when it cannot be read (an
 * old run past Workflow's retention, an outage): the caller then falls back
 * to the stale window instead of guessing either way.
 */
export async function analysisRunStatus(runId: string): Promise<AnalysisRunStatus | null> {
  try {
    return await getRun(runId).status;
  } catch (error) {
    logger.warn("analysis.run_status_unavailable", { err: error, runId });
    return null;
  }
}
