import { logger } from "@/shared/logger";
import { publicErrorMessage } from "@/shared/public-error-message";

import { extractFromZipBuffer } from "@/lib/files/extract";
import { isSourceFile, type ExtractedFile } from "@/lib/files/filters";
import { detectFramework } from "@/lib/files/framework";
import { deleteProjectFiles, persistProjectFiles } from "@/lib/files/storage";
import { downloadGitHubZipball, GitHubError } from "@/lib/github";
import { refundAnalysisUsage, withQuota } from "@/modules/billing/server";
import { getGitHubConnection } from "@/modules/identity/server";

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

    await storeExtractedFiles(options.userId, project.id, extracted);

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

/**
 * Shared by the import and the re-analysis: stores the extracted files
 * (atomically: the previous files stay if this fails) and queues the
 * project with its framework and source file count.
 */
async function storeExtractedFiles(
  userId: string,
  projectId: string,
  extracted: {
    sourceFiles: ExtractedFile[];
    allRelativePaths: string[];
    skippedLargeFiles: string[];
  },
) {
  const framework = detectFramework(
    extracted.sourceFiles,
    extracted.allRelativePaths,
  );
  const sourceOnly = extracted.sourceFiles.filter((file) =>
    isSourceFile(file.relativePath),
  );

  await persistProjectFiles(userId, projectId, extracted.sourceFiles);

  await setProjectProgress(userId, projectId, {
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
}

function githubFullName(project: {
  name: string;
  repositoryUrl: string | null;
}): string | null {
  if (project.name.includes("/")) return project.name;
  const match = project.repositoryUrl?.match(/github\.com\/([^/]+\/[^/#?]+)/i);
  return match?.[1]?.replace(/\.git$/i, "") ?? null;
}

/**
 * Re-analysis of a GitHub project: fetches the latest code and replaces the
 * stored files. Errors are user-facing (`GitHubError`); the caller marks the
 * project failed. Uploaded (ZIP) projects reuse their stored files.
 */
export async function refreshGitHubSources(project: {
  id: string;
  userId: string;
  name: string;
  source: "github" | "upload";
  repositoryUrl: string | null;
}): Promise<void> {
  if (project.source !== "github") return;

  const fullName = githubFullName(project);
  if (!fullName) {
    throw new GitHubError(
      "Could not determine the GitHub repository for this project.",
    );
  }

  const user = await getGitHubConnection(project.userId);

  if (!user?.githubAccessToken) {
    throw new GitHubError(
      "Connect GitHub in Settings before re-analyzing this repository.",
    );
  }

  await setProjectProgress(project.userId, project.id, {
    step: "Fetching latest code from GitHub",
    percent: 10,
    status: "processing",
    errorMessage: null,
  });

  // Validates `fullName` and aborts past MAX_REPO_SIZE_BYTES.
  const zipBuffer = await downloadGitHubZipball(
    { userId: project.userId, encryptedToken: user.githubAccessToken },
    fullName,
  );

  await setProjectProgress(project.userId, project.id, {
    step: "Reading updated files",
    percent: 18,
    status: "processing",
  });

  const extracted = await extractFromZipBuffer(zipBuffer, { stripRoot: true });
  if (!extracted.ok) {
    // Extraction errors are fixed, user-facing messages.
    throw new GitHubError(extracted.error);
  }

  await storeExtractedFiles(project.userId, project.id, extracted);
}
