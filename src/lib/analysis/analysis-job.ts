import "server-only";

import { start } from "workflow/api";

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
