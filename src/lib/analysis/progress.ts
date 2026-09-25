import { and, eq } from "drizzle-orm";

import { projects } from "@/db/schema";
import { db } from "@/lib/db";

export {
  ANALYSIS_STEPS,
  type AnalysisStepId,
} from "@/lib/analysis/progress-steps";

/** `userId` must come from the server session; other users' projects are never touched. */
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
  await db
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
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
}
