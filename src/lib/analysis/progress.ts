import { eq } from "drizzle-orm";

import { projects } from "@/db/schema";
import { db } from "@/lib/db";

export {
  ANALYSIS_STEPS,
  type AnalysisStepId,
} from "@/lib/analysis/progress-steps";

export async function setProjectProgress(
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
    .where(eq(projects.id, projectId));
}
