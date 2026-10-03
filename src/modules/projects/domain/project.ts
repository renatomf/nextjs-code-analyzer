/**
 * Project lifecycle: queued → processing → completed | failed. Pure rules;
 * the conditional SQL in infrastructure enforces the same ones atomically.
 */

export type ProjectStatus = "queued" | "processing" | "completed" | "failed";

/** An analysis is waiting or running: it can be canceled, not started again. */
export const ACTIVE_STATUSES = ["queued", "processing"] as const satisfies readonly ProjectStatus[];

/**
 * A "processing" project not updated for longer than one workflow step (the
 * function's maxDuration of 300 s + margin) is stale: its run is gone, so it
 * may restart. Every step writes progress when it starts, retries included
 * (ADR-005). A shorter window would start a second run while a slow step
 * still works.
 */
export const STALE_AFTER_SECONDS = 360;

export type AnalysisStart =
  | "completed" // nothing to do
  | "running" // a live run owns it
  | "import-failed" // no files were ever stored: create a new project
  | "claimable";

/** Status of a Workflow run, as the Workflow SDK reports it. */
export type AnalysisRunStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

/**
 * Whether the analysis of `project` can start now. `runStatus` is the status
 * of the workflow run that owns the project (null when there is no run id or
 * it could not be read): a live run wins over any clock, and a finished run
 * that left the project "processing" died, so it can restart at once. Without
 * a run, the stale window decides.
 */
export function analysisStart(
  project: { status: ProjectStatus; fileCount: number; updatedAt: Date },
  now: Date,
  runStatus: AnalysisRunStatus | null = null,
): AnalysisStart {
  if (project.status === "completed") return "completed";
  if (project.status === "processing") {
    if (runStatus === "pending" || runStatus === "running") return "running";
    if (
      runStatus === null &&
      now.getTime() - project.updatedAt.getTime() < STALE_AFTER_SECONDS * 1000
    ) {
      return "running";
    }
  }
  if (project.status === "failed" && project.fileCount === 0) return "import-failed";
  return "claimable";
}

/** Thrown by the pipeline when the project was canceled (deleted) mid-run. */
export class AnalysisCanceledError extends Error {
  constructor() {
    super("Analysis canceled.");
    this.name = "AnalysisCanceledError";
  }
}
