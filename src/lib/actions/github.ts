"use server";
import { publicErrorMessage } from "@/shared/public-error-message";

import { revalidatePath } from "next/cache";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { redirect } from "next/navigation";
import { z } from "zod";

import { startAnalysisRun } from "@/lib/analysis/analysis-job";
import { auth, signIn } from "@/lib/auth";
import { fullNameSchema, refSchema } from "@/lib/github";
import { MAX_UPLOAD_BYTES, UPLOAD_TOO_BIG_MESSAGE } from "@/lib/limits";
import { BillingLimitError } from "@/modules/billing";
import { getPlanCatalogWithPricing } from "@/modules/billing/server";
import {
  disconnectGitHub as forgetGitHubConnection,
  getGitHubConnection,
} from "@/modules/identity/server";
import {
  findExistingImport,
  importArchive,
  startGitHubImport,
} from "@/modules/projects/server";

export type ProjectActionState = {
  error?: string;
  /** Set when this project was already imported; the form asks to confirm. */
  duplicate?: { name: string };
  /** Plan limit reached: shown as a notice with the upgrade button. */
  limit?: LimitNotice;
};

export type LimitNotice = {
  title: string;
  detail: string;
  upgrade: { label: string; priceLabel: string; features: string[] } | null;
};

async function limitNotice(error: BillingLimitError): Promise<LimitNotice> {
  const paid = error.canUpgrade
    ? (await getPlanCatalogWithPricing()).premium
    : null;
  return {
    title: error.title ?? "Plan limit reached",
    detail: error.detail ?? error.message,
    upgrade: paid
      ? { label: paid.label, priceLabel: paid.priceLabel, features: paid.features }
      : null,
  };
}

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

/** Link GitHub via Auth.js (same callback URL as login). */
export async function connectGitHubAccount() {
  await requireUser();
  await signIn("github", { redirectTo: "/settings?github=connected" });
}

export async function disconnectGitHub() {
  const user = await requireUser();

  await forgetGitHubConnection(user.id);

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
  const { fullName } = parsed.data;

  const dbUser = await getGitHubConnection(user.id);

  if (!dbUser?.githubAccessToken) {
    return {
      error: "Connect GitHub in Settings before selecting a repository.",
    };
  }

  const repositoryUrl = `https://github.com/${fullName}`;
  if (
    formData.get("confirmReanalyze") !== "1" &&
    (await findExistingImport(user.id, { source: "github", repositoryUrl }))
  ) {
    return { duplicate: { name: fullName } };
  }

  try {
    // The download (up to 100 MB), extraction and storage run in the
    // analysis workflow (ADR-005, TD-10): this request only creates the
    // project under the quota and starts the run. GitHub refusing the
    // download then gives the analysis back (fetchGitHubSourcesStage).
    const { projectId, usageId } = await startGitHubImport({
      userId: user.id,
      name: fullName,
      repositoryUrl,
    });
    const started = await startAnalysisRun(user.id, projectId, {
      fetchFromGitHub: true,
      importUsageId: usageId,
    });
    if (!started) return { error: "Failed to import repository." };

    revalidatePath("/dashboard");
    redirect(`/projects/${projectId}/progress`);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    if (error instanceof BillingLimitError) {
      return { limit: await limitNotice(error) };
    }
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

  // Same rule as the form (UX only there): a bigger body would not reach a
  // Vercel function at all (TD-45).
  if (file.size > MAX_UPLOAD_BYTES) {
    return { error: UPLOAD_TOO_BIG_MESSAGE };
  }

  if (file.size === 0) {
    return { error: "The uploaded ZIP is empty." };
  }

  const name =
    file.name
      .replace(/\.zip$/i, "")
      .trim()
      .slice(0, MAX_PROJECT_NAME_LENGTH) || "Uploaded project";

  if (
    formData.get("confirmReanalyze") !== "1" &&
    (await findExistingImport(user.id, { source: "upload", name }))
  ) {
    return { duplicate: { name } };
  }

  try {
    const zipBuffer = Buffer.from(await file.arrayBuffer());

    const result = await importArchive({
      userId: user.id,
      name,
      source: "upload",
      zipBuffer,
    });

    revalidatePath("/dashboard");
    redirect(`/projects/${result.projectId}/progress`);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    if (error instanceof BillingLimitError) {
      return { limit: await limitNotice(error) };
    }
    return {
      error: publicErrorMessage(error, "Failed to upload project."),
    };
  }
}
