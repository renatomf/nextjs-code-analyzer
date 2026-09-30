"use server";
import { publicErrorMessage } from "@/shared/public-error-message";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { redirect } from "next/navigation";
import { z } from "zod";

import { projects } from "@/db/schema";
import { generateProjectReport } from "@/lib/analysis/report";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { extractFromZipBuffer } from "@/lib/files/extract";
import { isSourceFile } from "@/lib/files/filters";
import { detectFramework } from "@/lib/files/framework";
import { persistProjectFiles } from "@/lib/files/storage";
import { downloadGitHubZipball, GitHubError } from "@/lib/github";
import { assertRateLimit } from "@/lib/rate-limit";
import { BillingLimitError } from "@/modules/billing";
import { withQuota } from "@/modules/billing/server";
import { getGitHubConnection } from "@/modules/identity/server";
import {
  requeueIdleProject,
  setProjectProgress,
  startReanalysis,
} from "@/modules/projects/server";

export type RetryState = {
  error?: string;
};

const projectIdSchema = z.uuid();

// LLM / embedding cost protection, keyed by userId.
const AI_ACTION_MAX_PER_HOUR = 10;

function assertAiActionRateLimit(action: string, userId: string) {
  return assertRateLimit(
    `${action}:${userId}`,
    AI_ACTION_MAX_PER_HOUR,
    60 * 60 * 1000,
    `Rate limit reached (${AI_ACTION_MAX_PER_HOUR}/hour). Try again later.`,
  );
}

async function requireOwnedProject(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const parsed = projectIdSchema.safeParse(formData.get("projectId"));
  if (!parsed.success) return null;

  const [project] = await db
    .select({
      id: projects.id,
      userId: projects.userId,
      name: projects.name,
      source: projects.source,
      repositoryUrl: projects.repositoryUrl,
      progressPercent: projects.progressPercent,
    })
    .from(projects)
    .where(and(eq(projects.id, parsed.data), eq(projects.userId, session.user.id)))
    .limit(1);

  return project ?? null;
}

function githubFullName(project: {
  name: string;
  repositoryUrl: string | null;
}): string | null {
  if (project.name.includes("/")) return project.name;
  const match = project.repositoryUrl?.match(/github\.com\/([^/]+\/[^/#?]+)/i);
  return match?.[1]?.replace(/\.git$/i, "") ?? null;
}

async function refreshProjectSources(project: {
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

  const framework = detectFramework(
    extracted.sourceFiles,
    extracted.allRelativePaths,
  );
  const sourceOnly = extracted.sourceFiles.filter((file) =>
    isSourceFile(file.relativePath),
  );

  // Replaces the stored files atomically (old files kept if this fails).
  await persistProjectFiles(project.userId, project.id, extracted.sourceFiles);

  await setProjectProgress(project.userId, project.id, {
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

export async function retryProjectKnowledge(
  _prev: RetryState,
  formData: FormData,
): Promise<RetryState> {
  const project = await requireOwnedProject(formData);
  if (!project) return { error: "Project not found." };

  try {
    await assertAiActionRateLimit("knowledge", project.userId);
    // Embeddings run only in the analyze route (the only functions that ship
    // the ONNX runtime on Vercel), so queue the project and let the progress
    // page start it. Stored files are reused; no quota is consumed.
    const queued = await requeueIdleProject(
      project.userId,
      project.id,
      "Waiting to rebuild code knowledge",
    );
    if (!queued) {
      return { error: "Analysis is already running for this project." };
    }
    // "layout": the project header/tabs and every tab under it.
    revalidatePath(`/projects/${project.id}`, "layout");
    revalidatePath("/dashboard");
    redirect(`/projects/${project.id}/progress`);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return {
      error: publicErrorMessage(error, "Failed to rebuild code knowledge."),
    };
  }
}

export async function retryFullAnalysis(
  _prev: RetryState,
  formData: FormData,
): Promise<RetryState> {
  const project = await requireOwnedProject(formData);
  if (!project) return { error: "Project not found." };

  let claimed = false;

  try {
    // Limit check, "not already running" check and usage record in one
    // transaction: the user row is locked, so parallel requests cannot all
    // pass the limit or start the same project twice.
    claimed = await withQuota(project.userId, "analysis", async (tx) => {
      const started = await startReanalysis(tx, project.userId, project.id);
      // Already running: no new analysis, so no quota consumed.
      if (!started) return { consumed: false, value: false };

      return { consumed: true, value: true };
    });

    if (!claimed) {
      return { error: "Analysis is already running for this project." };
    }

    // Pull fresh GitHub code when possible; ZIP projects reuse stored files.
    await refreshProjectSources(project);

    await setProjectProgress(project.userId, project.id, {
      status: "queued",
      step:
        project.source === "github"
          ? "Latest code fetched — waiting to analyze"
          : "Waiting to restart analysis",
      percent: Math.max(project.progressPercent || 0, 25),
      errorMessage: null,
    });
    // "layout": the project header/tabs and every tab under it.
    revalidatePath(`/projects/${project.id}`, "layout");
    revalidatePath("/dashboard");
    redirect(`/projects/${project.id}/progress`);
  } catch (error) {
    if (isRedirectError(error)) throw error;

    if (error instanceof BillingLimitError) {
      return { error: error.message };
    }

    const message = publicErrorMessage(
      error,
      "Failed to restart project analysis.",
    );
    if (claimed) {
      await setProjectProgress(project.userId, project.id, {
        step: "Re-analyze failed",
        percent: project.progressPercent || 0,
        status: "failed",
        errorMessage: message,
      });
    }
    return { error: message };
  }
}

export async function generateReportAction(
  _prev: RetryState,
  formData: FormData,
): Promise<RetryState> {
  const project = await requireOwnedProject(formData);
  if (!project) return { error: "Project not found." };

  try {
    await assertAiActionRateLimit("report", project.userId);
    await generateProjectReport(project.userId, project.id);
    // "layout": the project header/tabs and every tab under it.
    revalidatePath(`/projects/${project.id}`, "layout");
    revalidatePath("/dashboard");
    redirect(`/projects/${project.id}/report`);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return {
      error: publicErrorMessage(error, "Failed to generate health report."),
    };
  }
}
