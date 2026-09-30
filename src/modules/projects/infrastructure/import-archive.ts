import { logger } from "@/shared/logger";
import { publicErrorMessage } from "@/shared/public-error-message";

import { extractFromZipBuffer } from "@/lib/files/extract";
import { isSourceFile } from "@/lib/files/filters";
import { detectFramework } from "@/lib/files/framework";
import { deleteProjectFiles, persistProjectFiles } from "@/lib/files/storage";
import { refundAnalysisUsage, withQuota } from "@/modules/billing/server";

import { createImportingProject, setProjectProgress } from "./drizzle-project-lifecycle";

/**
 * Import: creates the project under the plan quota, extracts the archive and
 * stores its files, leaving the project queued for analysis. The analysis
 * itself runs later, from the progress page.
 *
 * Quota (ADR-003): an invalid archive is the user's error and stays charged;
 * a failure on our side (an exception) gives the analysis back.
 */
export async function importArchive(options: {
  userId: string;
  name: string;
  source: "github" | "upload";
  repositoryUrl?: string;
  zipBuffer: Buffer;
}) {
  // Limit check, insert and usage record in one transaction: the user row is
  // locked, so parallel requests cannot all pass the check.
  const { project, usageId } = await withQuota(options.userId, "project", async (tx, usage) => {
    const created = await createImportingProject(tx, {
      userId: options.userId,
      name: options.name,
      source: options.source,
      repositoryUrl: options.repositoryUrl,
    });
    return { consumed: true, value: { project: created, usageId: usage.id } };
  });

  try {
    await setProjectProgress(options.userId, project.id, {
      step: "Reading files",
      percent: 15,
      status: "processing",
    });

    const extracted = await extractFromZipBuffer(options.zipBuffer, {
      stripRoot: options.source === "github",
    });

    // A bad archive (corrupt, too big, no JS/TS) is the user's error: the
    // analysis stays charged (ADR-003), so invalid uploads cannot be free.
    if (!extracted.ok) {
      await setProjectProgress(options.userId, project.id, {
        step: "Import failed",
        percent: 15,
        status: "failed",
        errorMessage: extracted.error,
      });
      return { projectId: project.id, failed: true as const };
    }

    await setProjectProgress(options.userId, project.id, {
      step: "Detecting framework",
      percent: 22,
      status: "processing",
    });

    const framework = detectFramework(
      extracted.sourceFiles,
      extracted.allRelativePaths,
    );
    const sourceOnly = extracted.sourceFiles.filter((file) =>
      isSourceFile(file.relativePath),
    );

    await persistProjectFiles(options.userId, project.id, extracted.sourceFiles);

    await setProjectProgress(options.userId, project.id, {
      step: "Files ready for analysis",
      percent: 25,
      status: "queued",
      framework,
      fileCount: sourceOnly.length,
      errorMessage:
        extracted.skippedLargeFiles.length > 0
          ? `Skipped ${extracted.skippedLargeFiles.length} file(s) over the size limit.`
          : null,
    });

    return { projectId: project.id, failed: false as const };
  } catch (error) {
    // Mark as failed first: if the cleanup below also fails, the project must
    // still leave `processing`.
    await setProjectProgress(options.userId, project.id, {
      step: "Import failed",
      percent: 10,
      status: "failed",
      errorMessage: publicErrorMessage(error, "Project ingestion failed."),
    });
    // A failure on our side (database, storage) gives the analysis back.
    await refundAnalysisUsage(options.userId, usageId).catch((refundError) => {
      logger.error("billing.refund_failed", { err: refundError, projectId: project.id });
    });
    // Best effort: persistProjectFiles is atomic, so there is rarely anything left.
    await deleteProjectFiles(options.userId, project.id).catch((cleanupError) => {
      logger.error("project.cleanup_failed", { err: cleanupError, projectId: project.id });
    });
    return { projectId: project.id, failed: true as const };
  }
}
