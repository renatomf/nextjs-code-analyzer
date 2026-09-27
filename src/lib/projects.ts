import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { cache } from "react";

import { codeChunks, projects, reports } from "@/db/schema";
import { db } from "@/lib/db";

/**
 * Project header data shared by the project layout and the overview page.
 * `cache` dedupes it per request, so both use a single query. `userId` must
 * come from the server session: another user's project resolves to undefined.
 */
export const getProjectSummary = cache(async (userId: string, projectId: string) => {
  const [project] = await db
    .select({
      id: projects.id,
      name: projects.name,
      source: projects.source,
      framework: projects.framework,
      status: projects.status,
      fileCount: projects.fileCount,
      repositoryUrl: projects.repositoryUrl,
      errorMessage: projects.errorMessage,
      healthScore: reports.healthScore,
      chunkCount: sql<number>`(select count(*) from ${codeChunks} where ${codeChunks.projectId} = ${projects.id})`.mapWith(Number),
      issueCount: sql<number>`coalesce(jsonb_array_length(${reports.issues}), 0)`.mapWith(Number),
      criticalCount: sql<number>`(select count(*) from jsonb_array_elements(coalesce(${reports.issues}, '[]'::jsonb)) as issue where issue->>'severity' = 'critical')`.mapWith(Number),
    })
    .from(projects)
    .leftJoin(reports, eq(reports.projectId, projects.id))
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1);

  return project;
});

export type ProjectSummary = NonNullable<Awaited<ReturnType<typeof getProjectSummary>>>;
