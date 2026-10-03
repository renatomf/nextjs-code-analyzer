import "server-only";

import { STUCK_AFTER_SECONDS, stuckProjectMessage } from "@/modules/projects";
import { failStuckProject, findStuckProjects } from "@/modules/projects/server";
import { logger } from "@/shared/logger";

import { analysisRunStatus } from "./analysis-job";

/** Bounds one daily run; the rest waits for the next day. */
const REAP_LIMIT = 100;

export type ReapResult = { checked: number; failed: number; alive: number };

/**
 * Fails projects stuck in "processing" that nobody reopened (TD-11). A
 * project whose workflow run is still pending or running is left alone,
 * however old its last write; an import (no run) or a finished run that
 * left the project "processing" is failed with a message the user can act
 * on. Called by the daily cron (`/api/cron/reap-stuck-projects`).
 */
export async function reapStuckProjects(): Promise<ReapResult> {
  const stuck = await findStuckProjects(STUCK_AFTER_SECONDS, REAP_LIMIT);
  let failed = 0;
  let alive = 0;

  for (const project of stuck) {
    if (project.analysisRunId) {
      const status = await analysisRunStatus(project.analysisRunId);
      if (status === "pending" || status === "running") {
        alive += 1;
        continue;
      }
    }
    if (await failStuckProject(project, STUCK_AFTER_SECONDS, stuckProjectMessage(project.fileCount))) {
      failed += 1;
    }
  }

  const result = { checked: stuck.length, failed, alive };
  logger.info("projects.reaped", result);
  return result;
}
