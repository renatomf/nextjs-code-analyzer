import "server-only";

import { getRun, start } from "workflow/api";

import type { AnalysisRunStatus } from "@/modules/projects";
import { logger } from "@/shared/logger";

import { analysisWorkflow } from "./analysis-workflow";

/**
 * Starts the analysis workflow (ADR-005) and returns at once; the steps
 * write their progress to the project. Only ids are passed: the run's
 * arguments are stored by Workflow. `userId` must come from the session.
 */
export async function enqueueAnalysis(userId: string, projectId: string): Promise<string> {
  const run = await start(analysisWorkflow, [userId, projectId]);
  return run.runId;
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
