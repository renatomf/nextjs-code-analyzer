"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { redirect } from "next/navigation";
import { z } from "zod";

import { accounts, projects, users } from "@/db/schema";
import { setProjectProgress } from "@/lib/analysis/progress";
import { auth, signIn } from "@/lib/auth";
import {
  assertCanCreateProject,
  BillingLimitError,
  recordAnalysisUsage,
} from "@/lib/billing/entitlements";
import { db } from "@/lib/db";
import { extractFromZipBuffer } from "@/lib/files/extract";
import { isSourceFile } from "@/lib/files/filters";
import { detectFramework } from "@/lib/files/framework";
import { deleteProjectFiles, persistProjectFiles } from "@/lib/files/storage";
import {
  downloadGitHubZipball,
  fullNameSchema,
  GitHubError,
  refSchema,
} from "@/lib/github";
import { MAX_REPO_SIZE_BYTES } from "@/lib/limits";

export type ProjectActionState = {
  error?: string;
};

const MAX_PROJECT_NAME_LENGTH = 100;

const githubImportSchema = z.object({
  fullName: fullNameSchema,
  defaultBranch: refSchema.optional(),
});

async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  return session.user;
}

/**
 * Only our own error types carry user-facing messages; anything else (DB,
 * network, bugs) may contain internals and becomes a generic message.
 */
function publicErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof BillingLimitError || error instanceof GitHubError) {
    return error.message;
  }
  console.error(fallback);
  return fallback;
}

/** Link GitHub via Auth.js (same callback URL as login). */
export async function connectGitHubAccount() {
  await requireUser();
  await signIn("github", { redirectTo: "/settings?github=connected" });
}

/**
 * Ingest files only, then hand off to the progress page for live analysis.
 */
async function finalizeProjectFromZip(options: {
  userId: string;
  name: string;
  source: "github" | "upload";
  repositoryUrl?: string;
  zipBuffer: Buffer;
}) {
  // Limit check, insert and usage record in one transaction: the user row is
  // locked, so parallel requests cannot all pass the check.
  const project = await db.transaction(async (tx) => {
    await assertCanCreateProject(options.userId, tx);

    const [created] = await tx
      .insert(projects)
      .values({
        userId: options.userId,
        name: options.name,
        source: options.source,
        repositoryUrl: options.repositoryUrl,
        status: "processing",
        progressStep: "Reading files",
        progressPercent: 10,
      })
      .returning({ id: projects.id });

    await recordAnalysisUsage(options.userId, tx);
    return created;
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
    // Best effort: persistProjectFiles is atomic, so there is rarely anything left.
    await deleteProjectFiles(options.userId, project.id).catch(() => {
      console.error("Failed to clean up project files");
    });
    return { projectId: project.id, failed: true as const };
  }
}

export async function disconnectGitHub() {
  const user = await requireUser();

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ githubAccessToken: null, githubUsername: null })
      .where(eq(users.id, user.id));

    await tx
      .delete(accounts)
      .where(and(eq(accounts.userId, user.id), eq(accounts.provider, "github")));
  });

  revalidatePath("/settings");
  revalidatePath("/projects/new");
}

export async function createProjectFromGitHub(
  _prev: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  const user = await requireUser();
  const parsed = githubImportSchema.safeParse({
    fullName: formData.get("fullName") ?? undefined,
    defaultBranch: formData.get("defaultBranch") || undefined,
  });

  if (!parsed.success) {
    return { error: "Invalid repository selection." };
  }
  const { fullName, defaultBranch } = parsed.data;

  const [dbUser] = await db
    .select({ githubAccessToken: users.githubAccessToken })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  if (!dbUser?.githubAccessToken) {
    return {
      error: "Connect GitHub in Settings before selecting a repository.",
    };
  }

  try {
    const zipBuffer = await downloadGitHubZipball(
      { userId: user.id, encryptedToken: dbUser.githubAccessToken },
      fullName,
      defaultBranch,
    );

    if (zipBuffer.byteLength > MAX_REPO_SIZE_BYTES) {
      return {
        error: `Repository archive exceeds the ${MAX_REPO_SIZE_BYTES / (1024 * 1024)} MB limit.`,
      };
    }

    const result = await finalizeProjectFromZip({
      userId: user.id,
      name: fullName,
      source: "github",
      repositoryUrl: `https://github.com/${fullName}`,
      zipBuffer,
    });

    revalidatePath("/dashboard");
    redirect(`/projects/${result.projectId}/progress`);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return {
      error: publicErrorMessage(error, "Failed to import repository."),
    };
  }
}

export async function createProjectFromZip(
  _prev: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  const user = await requireUser();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return { error: "Please choose a ZIP file to upload." };
  }

  if (!file.name.toLowerCase().endsWith(".zip")) {
    return { error: "Only .zip uploads are supported." };
  }

  if (file.size > MAX_REPO_SIZE_BYTES) {
    return {
      error: `ZIP exceeds the ${MAX_REPO_SIZE_BYTES / (1024 * 1024)} MB limit.`,
    };
  }

  if (file.size === 0) {
    return { error: "The uploaded ZIP is empty." };
  }

  try {
    const zipBuffer = Buffer.from(await file.arrayBuffer());
    const name =
      file.name
        .replace(/\.zip$/i, "")
        .trim()
        .slice(0, MAX_PROJECT_NAME_LENGTH) || "Uploaded project";

    const result = await finalizeProjectFromZip({
      userId: user.id,
      name,
      source: "upload",
      zipBuffer,
    });

    revalidatePath("/dashboard");
    redirect(`/projects/${result.projectId}/progress`);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return {
      error: publicErrorMessage(error, "Failed to upload project."),
    };
  }
}
