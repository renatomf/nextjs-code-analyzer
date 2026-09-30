"use server";
import { logger } from "@/shared/logger";

import { redirect } from "next/navigation";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { assertRateLimit, RateLimitError } from "@/lib/rate-limit";
import { SHARE_EXPIRY_OPTIONS } from "@/modules/projects";
import { createReportShare, revokeReportShare } from "@/modules/projects/server";

const SHARE_ACTIONS_MAX_PER_HOUR = 20;

const createSchema = z.object({
  projectId: z.uuid(),
  expiry: z.enum(SHARE_EXPIRY_OPTIONS),
});

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return session.user.id;
}

/**
 * Creates (or replaces) the public link of the user's report. The path with
 * the token is returned once and never stored.
 */
export async function createReportShareAction(input: {
  projectId: string;
  expiry: string;
}): Promise<{ path: string; expiresAt: string | null } | { error: string }> {
  const userId = await requireUserId();
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { error: "Project not found." };

  try {
    await assertRateLimit(
      `report-share:${userId}`,
      SHARE_ACTIONS_MAX_PER_HOUR,
      60 * 60 * 1000,
      "Too many share requests. Try again later.",
    );
    const share = await createReportShare(userId, parsed.data.projectId, parsed.data.expiry);
    if (!share) return { error: "Only a finished analysis can be shared." };
    return {
      path: `/r/${share.token}`,
      expiresAt: share.expiresAt?.toISOString() ?? null,
    };
  } catch (error) {
    if (error instanceof RateLimitError) return { error: error.message };
    logger.error("report_share.create_failed", { err: error, userId });
    return { error: "Could not create the link. Try again." };
  }
}

export async function revokeReportShareAction(input: {
  projectId: string;
}): Promise<{ ok: true } | { error: string }> {
  const userId = await requireUserId();
  const parsed = z.object({ projectId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { error: "Project not found." };

  try {
    const revoked = await revokeReportShare(userId, parsed.data.projectId);
    if (!revoked) return { error: "There is no active link to revoke." };
    return { ok: true };
  } catch (error) {
    logger.error("report_share.revoke_failed", { err: error, userId });
    return { error: "Could not revoke the link. Try again." };
  }
}
