/**
 * Project lifecycle: queued → processing → completed | failed. Pure rules;
 * the conditional SQL in infrastructure enforces the same ones atomically.
 */

export type ProjectStatus = "queued" | "processing" | "completed" | "failed";

/** An analysis is waiting or running: it can be canceled, not started again. */
export const ACTIVE_STATUSES = ["queued", "processing"] as const satisfies readonly ProjectStatus[];

/**
 * A "processing" project not updated for longer than one full run
 * (the analyze route's maxDuration of 300 s + margin) is stale: its request
 * is gone, so it may restart. A shorter window would start a second run while
 * a slow step still works.
 */
export const STALE_AFTER_SECONDS = 360;

export type AnalysisStart =
  | "completed" // nothing to do
  | "running" // a live run owns it
  | "import-failed" // no files were ever stored: create a new project
  | "claimable";

/** Whether the analysis of `project` can start now. */
export function analysisStart(
  project: { status: ProjectStatus; fileCount: number; updatedAt: Date },
  now: Date,
): AnalysisStart {
  if (project.status === "completed") return "completed";
  if (
    project.status === "processing" &&
    now.getTime() - project.updatedAt.getTime() < STALE_AFTER_SECONDS * 1000
  ) {
    return "running";
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
