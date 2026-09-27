import { and, eq } from "drizzle-orm";

import { projects } from "@/db/schema";
import { db } from "@/lib/db";

export {
  ANALYSIS_STEPS,
  type AnalysisStepId,
} from "@/lib/analysis/progress-steps";

/** Thrown by the pipeline when the project was canceled (deleted) mid-run. */
export class AnalysisCanceledError extends Error {
  constructor() {
    super("Analysis canceled.");
    this.name = "AnalysisCanceledError";
  }
}

/**
 * `userId` must come from the server session; other users' projects are never
 * touched. Returns `false` when the project no longer exists (canceled).
 */
export async function setProjectProgress(
  userId: string,
  projectId: string,
  options: {
    step: string;
    percent: number;
    status?: "queued" | "processing" | "completed" | "failed";
    errorMessage?: string | null;
    framework?: string | null;
    fileCount?: number;
  },
) {
  const updated = await db
    .update(projects)
    .set({
      progressStep: options.step,
      progressPercent: options.percent,
      ...(options.status ? { status: options.status } : {}),
      ...(options.errorMessage !== undefined
        ? { errorMessage: options.errorMessage }
        : {}),
      ...(options.framework !== undefined
        ? { framework: options.framework }
        : {}),
      ...(options.fileCount !== undefined
        ? { fileCount: options.fileCount }
        : {}),
    })
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .returning({ id: projects.id });

  return updated.length > 0;
}
