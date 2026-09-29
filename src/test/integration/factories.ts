import { randomUUID } from "node:crypto";

import { inArray } from "drizzle-orm";

import { codeChunks, projectFiles, projects, reports, users } from "@/db/schema";
import { db } from "@/lib/db";

const EMBEDDING_DIMENSIONS = 384;

/** Unit vector pointing at one axis: distinct, deterministic embeddings. */
export function axisEmbedding(axis: number): number[] {
  return Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => (i === axis ? 1 : 0));
}

export async function createUser() {
  const [user] = await db
    .insert(users)
    .values({ email: `it-${randomUUID()}@example.test`, name: "Integration" })
    .returning({ id: users.id });
  return user.id;
}

/** A project with one stored file, one embedded chunk and a report. */
export async function createProjectWithData(userId: string, label: string) {
  const [project] = await db
    .insert(projects)
    .values({
      userId,
      name: `project-${label}`,
      source: "upload",
      status: "completed",
      fileCount: 1,
      progressStep: "Done",
      progressPercent: 100,
    })
    .returning({ id: projects.id });

  await db.insert(projectFiles).values({
    projectId: project.id,
    relativePath: `src/${label}.ts`,
    content: `export const secret = "${label}-private-code";`,
    sizeBytes: 40,
  });
  await db.insert(codeChunks).values({
    projectId: project.id,
    filePath: `src/${label}.ts`,
    content: `${label}-private-chunk`,
    startLine: 1,
    endLine: 1,
    embedding: axisEmbedding(0),
  });
  await db.insert(reports).values({
    projectId: project.id,
    healthScore: 80,
    categoryScores: {
      architecture: 80,
      security: 80,
      performance: 80,
      codeQuality: 80,
      testing: 80,
    },
    issues: [],
  });

  return project.id;
}

/** Deleting the users cascades to every row the tests created. */
export async function deleteUsers(userIds: string[]) {
  if (userIds.length > 0) {
    await db.delete(users).where(inArray(users.id, userIds));
  }
}
