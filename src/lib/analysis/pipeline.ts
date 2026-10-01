import { DomainError } from "@/shared/errors";
import { logger } from "@/shared/logger";
import { chunkProjectFiles } from "@/lib/analysis/chunking";
import {
  AnalysisCanceledError,
  setProjectProgress,
} from "@/lib/analysis/progress";
import { loadProjectSourceFiles } from "@/lib/analysis/project-files";
import { generateProjectReport } from "@/lib/analysis/report";
import { storeProjectChunks } from "@/modules/ingestion/server";
import { traced } from "@/shared/tracing";

// `userId` must come from the server session: every step below is scoped by
// it, so a projectId sent by the client can never reach another user's data.

/** Progress update that doubles as a checkpoint: stops the run if canceled. */
async function checkpoint(
  userId: string,
  projectId: string,
  options: Parameters<typeof setProjectProgress>[2],
) {
  if (!(await setProjectProgress(userId, projectId, options))) {
    throw new AnalysisCanceledError();
  }
}

export async function buildProjectKnowledge(
  userId: string,
  projectId: string,
): Promise<{
  chunkCount: number;
  fileCount: number;
}> {
  await checkpoint(userId, projectId, {
    step: "Creating code knowledge",
    percent: 40,
    status: "processing",
    errorMessage: null,
  });

  try {
    const files = await traced("pipeline.load_files", {}, () =>
      loadProjectSourceFiles(userId, projectId),
    );
    if (files.length === 0) {
      throw new DomainError(
        "No JavaScript/TypeScript source files found to analyze.",
      );
    }

    await checkpoint(userId, projectId, {
      step: "Chunking source files",
      percent: 50,
      fileCount: files.length,
    });

    const drafts = await traced("pipeline.chunk", { files: files.length }, async () =>
      chunkProjectFiles(files),
    );

    await checkpoint(userId, projectId, {
      step: "Generating embeddings",
      percent: 65,
    });

    const chunkCount = await storeProjectChunks(userId, projectId, drafts);

    await checkpoint(userId, projectId, {
      step: "Code knowledge ready",
      percent: 75,
      fileCount: files.length,
    });

    return { chunkCount, fileCount: files.length };
  } catch (error) {
    if (error instanceof AnalysisCanceledError) throw error;

    // errorMessage is shown to the user: a DomainError explains the problem
    // (e.g. no JS/TS files); raw errors (DB, model download) may carry
    // internals, so they become a generic message (TD-33).
    const isDomain = error instanceof DomainError;
    const stillExists = await setProjectProgress(userId, projectId, {
      step: "Knowledge build failed",
      percent: 65,
      status: "failed",
      errorMessage: isDomain ? error.message : "Failed to build code knowledge base.",
    });
    // Deleted mid-step (canceled): the failed write was the FK, not a bug.
    if (!stillExists) throw new AnalysisCanceledError();

    if (isDomain) {
      logger.warn("analysis.knowledge_rejected", { err: error, userId, projectId });
    } else {
      logger.error("analysis.knowledge_failed", { err: error, userId, projectId });
    }
    throw error;
  }
}

/**
 * Full analysis path used after import:
 * knowledge base first, then health report.
 */
export async function runFullProjectAnalysis(
  userId: string,
  projectId: string,
): Promise<void> {
  await checkpoint(userId, projectId, {
    step: "Starting analysis",
    percent: 30,
    status: "processing",
    errorMessage: null,
  });

  await buildProjectKnowledge(userId, projectId);

  await checkpoint(userId, projectId, {
    step: "Running analysis",
    percent: 80,
    status: "processing",
  });

  await checkpoint(userId, projectId, {
    step: "Generating report",
    percent: 90,
  });

  await generateProjectReport(userId, projectId);

  await checkpoint(userId, projectId, {
    step: "Complete",
    percent: 100,
    status: "completed",
    errorMessage: null,
  });
}
