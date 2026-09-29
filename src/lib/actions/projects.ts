"use server";
import { logger } from "@/shared/logger";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { projects } from "@/db/schema";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

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
    const deleted = await db
      .delete(projects)
      .where(
        and(eq(projects.id, parsed.data), eq(projects.userId, session.user.id)),
      )
      .returning({ id: projects.id });

    if (deleted.length === 0) return { error: "Project not found." };
  } catch (error) {
    logger.error("project.delete_failed", { err: error });
    return { error: "Could not delete the project. Try again." };
  }

  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * Cancels an import/analysis in progress by deleting the project, so nothing
 * (files, chunks, report) is kept. The running pipeline stops at its next step
 * (`setProjectProgress` finds no row) and any late write fails on the FK.
 */
export async function cancelAnalysis(
  projectId: string,
): Promise<{ ok: true } | { error: string }> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const parsed = projectIdSchema.safeParse(projectId);
  if (!parsed.success) return { error: "Project not found." };

  try {
    const canceled = await db
      .delete(projects)
      .where(
        and(
          eq(projects.id, parsed.data),
          eq(projects.userId, session.user.id),
          inArray(projects.status, ["queued", "processing"]),
        ),
      )
      .returning({ id: projects.id });

    if (canceled.length === 0) {
      return { error: "This analysis is no longer running." };
    }
  } catch (error) {
    logger.error("project.cancel_failed", { err: error });
    return { error: "Could not cancel the analysis. Try again." };
  }

  revalidatePath("/dashboard");
  return { ok: true };
}
