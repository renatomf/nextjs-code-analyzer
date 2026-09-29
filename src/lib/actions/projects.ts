"use server";
import { logger } from "@/shared/logger";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { cancelActiveAnalysis, deleteProject as deleteOwnedProject } from "@/modules/projects/server";

const projectIdSchema = z.string().uuid();

/**
 * Deletes a project owned by the signed-in user. Files, chunks and the report
 * go with it (ON DELETE CASCADE).
 */
export async function deleteProject(
  projectId: string,
): Promise<{ ok: true } | { error: string }> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const parsed = projectIdSchema.safeParse(projectId);
  if (!parsed.success) return { error: "Project not found." };

  try {
    const deleted = await deleteOwnedProject(session.user.id, parsed.data);
    if (!deleted) return { error: "Project not found." };
  } catch (error) {
    logger.error("project.delete_failed", { err: error });
    return { error: "Could not delete the project. Try again." };
  }

  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * Cancels an import/analysis in progress by deleting the project, so nothing
 * (files, chunks, report) is kept.
 */
export async function cancelAnalysis(
  projectId: string,
): Promise<{ ok: true } | { error: string }> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const parsed = projectIdSchema.safeParse(projectId);
  if (!parsed.success) return { error: "Project not found." };

  try {
    const canceled = await cancelActiveAnalysis(session.user.id, parsed.data);
    if (!canceled) {
      return { error: "This analysis is no longer running." };
    }
  } catch (error) {
    logger.error("project.cancel_failed", { err: error });
    return { error: "Could not cancel the analysis. Try again." };
  }

  revalidatePath("/dashboard");
  return { ok: true };
}
