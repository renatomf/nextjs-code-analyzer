import { chunkProjectFiles } from "@/lib/analysis/chunking";
import { setProjectProgress } from "@/lib/analysis/progress";
import { loadProjectSourceFiles } from "@/lib/analysis/project-files";
import { generateProjectReport } from "@/lib/analysis/report";
import { storeProjectChunks } from "@/lib/analysis/vector-store";

// `userId` must come from the server session: every step below is scoped by
// it, so a projectId sent by the client can never reach another user's data.

export async function buildProjectKnowledge(
  userId: string,
  projectId: string,
): Promise<{
  chunkCount: number;
  fileCount: number;
}> {
  await setProjectProgress(userId, projectId, {
    step: "Creating code knowledge",
    percent: 40,
    status: "processing",
    errorMessage: null,
  });

  try {
    const files = await loadProjectSourceFiles(userId, projectId);
    if (files.length === 0) {
      throw new Error(
        "No JavaScript/TypeScript source files found to analyze.",
      );
    }

    await setProjectProgress(userId, projectId, {
      step: "Chunking source files",
      percent: 50,
      fileCount: files.length,
    });

    const drafts = chunkProjectFiles(files);

    await setProjectProgress(userId, projectId, {
      step: "Generating embeddings",
      percent: 65,
    });

    const chunkCount = await storeProjectChunks(userId, projectId, drafts);

    await setProjectProgress(userId, projectId, {
      step: "Code knowledge ready",
      percent: 75,
      fileCount: files.length,
    });

    return { chunkCount, fileCount: files.length };
  } catch (error) {
    // errorMessage is shown to the user: raw errors (DB, model download) may
    // carry internals, so only a generic message is stored.
    console.error("Failed to build code knowledge base");
    await setProjectProgress(userId, projectId, {
      step: "Knowledge build failed",
      percent: 65,
      status: "failed",
      errorMessage: "Failed to build code knowledge base.",
    });
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
  await setProjectProgress(userId, projectId, {
    step: "Starting analysis",
    percent: 30,
    status: "processing",
    errorMessage: null,
  });

  await buildProjectKnowledge(userId, projectId);

  await setProjectProgress(userId, projectId, {
    step: "Running analysis",
    percent: 80,
    status: "processing",
  });

  await setProjectProgress(userId, projectId, {
    step: "Generating report",
    percent: 90,
  });

  await generateProjectReport(userId, projectId);

  await setProjectProgress(userId, projectId, {
    step: "Complete",
    percent: 100,
    status: "completed",
    errorMessage: null,
  });
}
