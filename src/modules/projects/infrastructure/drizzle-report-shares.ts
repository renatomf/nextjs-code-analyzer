import { createHash, randomBytes } from "node:crypto";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { projects, reportShares, reports } from "@/db/schema";
import type { ReportIssue } from "@/lib/analysis/report-types";
import { db } from "@/lib/db";

import {
  isShareActive,
  redactForPublic,
  shareExpiresAt,
  type ShareExpiry,
} from "../domain/report-share";

/**
 * Public report links. The token (256 random bits) is returned to the owner
 * once; only its SHA-256 is stored, so the database alone cannot rebuild a
 * link. Owner operations are scoped by the session's `userId`.
 */

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

const ownedProjectIds = (userId: string, projectId: string) =>
  db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));

/**
 * Creates the project's link, replacing (and so invalidating) any previous
 * one. Null when the user has no completed, reported project with this id.
 */
export async function createReportShare(
  userId: string,
  projectId: string,
  expiry: ShareExpiry,
): Promise<{ token: string; expiresAt: Date | null } | null> {
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .innerJoin(reports, eq(reports.projectId, projects.id))
    .where(
      and(
        eq(projects.id, projectId),
        eq(projects.userId, userId),
        eq(projects.status, "completed"),
      ),
    )
    .limit(1);
  if (!project) return null;

  const token = randomBytes(32).toString("base64url");
  const values = {
    tokenHash: hashToken(token),
    expiresAt: shareExpiresAt(expiry, new Date()),
    revokedAt: null,
  };
  await db
    .insert(reportShares)
    .values({ projectId: project.id, ...values })
    .onConflictDoUpdate({
      target: reportShares.projectId,
      set: { ...values, createdAt: sql`now()` },
    });

  return { token, expiresAt: values.expiresAt };
}

/** Revokes the project's active link. False when there is none to revoke. */
export async function revokeReportShare(userId: string, projectId: string): Promise<boolean> {
  const revoked = await db
    .update(reportShares)
    .set({ revokedAt: sql`now()` })
    .where(
      and(
        inArray(reportShares.projectId, ownedProjectIds(userId, projectId)),
        isNull(reportShares.revokedAt),
      ),
    )
    .returning({ id: reportShares.id });
  return revoked.length > 0;
}

/** The owner's view of the link (never the token itself). */
export async function getReportShareState(userId: string, projectId: string) {
  const [share] = await db
    .select({
      expiresAt: reportShares.expiresAt,
      revokedAt: reportShares.revokedAt,
      createdAt: reportShares.createdAt,
    })
    .from(reportShares)
    .where(inArray(reportShares.projectId, ownedProjectIds(userId, projectId)))
    .limit(1);
  if (!share) return null;
  return {
    active: isShareActive(share, new Date()),
    expiresAt: share.expiresAt,
    createdAt: share.createdAt,
  };
}

export type SharedReport = {
  projectName: string;
  framework: string | null;
  analyzedAt: Date;
  healthScore: number;
  categoryScores: Record<string, number>;
  summaries: Record<string, string>;
  issues: ReportIssue[];
};

/**
 * The read-only report behind a public token, or null when the token is
 * unknown, revoked or expired (the caller answers the same 404 for all).
 * Only the report: no source code, repository URL, owner or error details,
 * and free text is redacted.
 */
export async function findSharedReport(token: string): Promise<SharedReport | null> {
  const [row] = await db
    .select({
      expiresAt: reportShares.expiresAt,
      revokedAt: reportShares.revokedAt,
      projectName: projects.name,
      framework: projects.framework,
      analyzedAt: reports.createdAt,
      healthScore: reports.healthScore,
      categoryScores: reports.categoryScores,
      issues: reports.issues,
    })
    .from(reportShares)
    .innerJoin(projects, eq(projects.id, reportShares.projectId))
    .innerJoin(reports, eq(reports.projectId, reportShares.projectId))
    .where(eq(reportShares.tokenHash, hashToken(token)))
    .limit(1);

  if (!row || !isShareActive(row, new Date())) return null;

  const { summaries: storedSummaries, ...scores } = row.categoryScores;
  const summaries: Record<string, string> = storedSummaries ?? {};
  return {
    projectName: row.projectName,
    framework: row.framework,
    analyzedAt: row.analyzedAt,
    healthScore: row.healthScore,
    categoryScores: scores,
    summaries: Object.fromEntries(
      Object.entries(summaries).map(([category, text]) => [category, redactForPublic(text)]),
    ),
    // Explicit fields only: anything new must pass through redaction here.
    issues: row.issues.map((issue) => ({
      title: redactForPublic(issue.title),
      description: redactForPublic(issue.description),
      severity: issue.severity,
      category: issue.category,
      filePath: issue.filePath,
      // Line numbers only: the quoted code (snippet) stays private.
      ...(issue.evidence
        ? { evidence: { startLine: issue.evidence.startLine, endLine: issue.evidence.endLine } }
        : {}),
      ...(issue.occurrences
        ? {
            occurrences: issue.occurrences.map((occurrence) => ({
              filePath: occurrence.filePath,
              severity: occurrence.severity,
              title: redactForPublic(occurrence.title),
              description: redactForPublic(occurrence.description),
            })),
          }
        : {}),
    })),
  };
}
