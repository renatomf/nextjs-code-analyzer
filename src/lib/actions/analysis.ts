"use server";

import { and, eq, notInArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { redirect } from "next/navigation";
import { z } from "zod";

import { projects, users } from "@/db/schema";
import { buildProjectKnowledge } from "@/lib/analysis/pipeline";
import { setProjectProgress } from "@/lib/analysis/progress";
import { generateProjectReport } from "@/lib/analysis/report";
import { auth } from "@/lib/auth";
import {
  assertCanRunAnalysis,
  BillingLimitError,
  recordAnalysisUsage,
} from "@/lib/billing/entitlements";
import { db } from "@/lib/db";
import { extractFromZipBuffer } from "@/lib/files/extract";
import { isSourceFile } from "@/lib/files/filters";
import { detectFramework } from "@/lib/files/framework";
import { persistProjectFiles } from "@/lib/files/storage";
import { downloadGitHubZipball, GitHubError } from "@/lib/github";

export type RetryState = {
  error?: string;
};

const projectIdSchema = z.uuid();

/**
 * Only our own error types carry user-facing messages; anything else (DB,
 * LLM provider, bugs) may contain internals and becomes a generic message.
 */
function publicErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof BillingLimitError || error instanceof GitHubError) {
    return error.message;
  }
  console.error(fallback);
  return fallback;
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

  const [user] = await db
    .select({ githubAccessToken: users.githubAccessToken })
    .from(users)
    .where(eq(users.id, project.userId))
    .limit(1);

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
    await buildProjectKnowledge(project.userId, project.id);
    revalidatePath(`/projects/${project.id}`);
    revalidatePath("/dashboard");
    redirect(`/projects/${project.id}`);
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
    claimed = await db.transaction(async (tx) => {
      await assertCanRunAnalysis(project.userId, tx);

      const [started] = await tx
        .update(projects)
        .set({ status: "processing", errorMessage: null })
        .where(
          and(
            eq(projects.id, project.id),
            eq(projects.userId, project.userId),
            notInArray(projects.status, ["processing", "queued"]),
          ),
        )
        .returning({ id: projects.id });
      if (!started) return false;

      await recordAnalysisUsage(project.userId, tx);
      return true;
    });

    if (!claimed) {
      return { error: "Analysis is already running for this project." };
    }

    // Pull fresh GitHub code when possible; ZIP projects reuse stored files.
    await refreshProjectSources(project);

    await db
      .update(projects)
      .set({
        status: "queued",
        progressStep:
          project.source === "github"
            ? "Latest code fetched — waiting to analyze"
            : "Waiting to restart analysis",
        progressPercent: Math.max(project.progressPercent || 0, 25),
        errorMessage: null,
      })
      .where(and(eq(projects.id, project.id), eq(projects.userId, project.userId)));
    revalidatePath(`/projects/${project.id}`);
    revalidatePath(`/projects/${project.id}/progress`);
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
    await generateProjectReport(project.userId, project.id);
    revalidatePath(`/projects/${project.id}`);
    revalidatePath(`/projects/${project.id}/report`);
    revalidatePath("/dashboard");
    redirect(`/projects/${project.id}/report`);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return {
      error: publicErrorMessage(error, "Failed to generate health report."),
    };
  }
}
