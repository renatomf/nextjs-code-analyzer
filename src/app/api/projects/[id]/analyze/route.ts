import { and, eq, gt, lt, or, sql } from "drizzle-orm";
import { z } from "zod";

import { projects } from "@/db/schema";
import { runFullProjectAnalysis } from "@/lib/analysis/pipeline";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { assertRateLimit, RateLimitError } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 300;

// A "processing" project not updated for longer than one full run
// (maxDuration + margin) is stale: its request is gone, so it may restart.
// A shorter window would start a second run while a slow step still works.
const STALE_AFTER_SECONDS = 360;

// Embeddings + LLM report: cost protection, keyed by userId.
const ANALYZE_MAX_PER_HOUR = 10;

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function readProgress(userId: string, projectId: string) {
  const [project] = await db
    .select({
      status: projects.status,
      progressStep: projects.progressStep,
      progressPercent: projects.progressPercent,
    })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1);
  return project;
}

export async function POST(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const { id } = await context.params;
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  const [project] = await db
    .select({
      id: projects.id,
      status: projects.status,
      fileCount: projects.fileCount,
      progressStep: projects.progressStep,
      progressPercent: projects.progressPercent,
      updatedAt: projects.updatedAt,
    })
    .from(projects)
    .where(and(eq(projects.id, parsedId.data), eq(projects.userId, userId)))
    .limit(1);

  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  if (project.status === "completed") {
    return Response.json({
      ok: true,
      alreadyCompleted: true,
      status: project.status,
    });
  }

  const alreadyRunning = () =>
    Response.json({
      ok: true,
      alreadyRunning: true,
      status: project.status,
      progressStep: project.progressStep,
      progressPercent: project.progressPercent,
    });

  // Avoid starting a second run if one is clearly in-flight.
  if (
    project.status === "processing" &&
    Date.now() - project.updatedAt.getTime() < STALE_AFTER_SECONDS * 1000
  ) {
    return alreadyRunning();
  }

  if (project.status === "failed" && project.fileCount === 0) {
    return Response.json(
      {
        error:
          "Import failed before files were ready. Please create a new project.",
      },
      { status: 400 },
    );
  }

  try {
    await assertRateLimit(
      `analyze:${userId}`,
      ANALYZE_MAX_PER_HOUR,
      60 * 60 * 1000,
      `Rate limit reached (${ANALYZE_MAX_PER_HOUR} analyses/hour). Try again later.`,
    );
  } catch (error) {
    if (error instanceof RateLimitError) {
      return Response.json({ error: error.message }, { status: 429 });
    }
    console.error("Analyze API error");
    return Response.json({ error: "Analysis failed." }, { status: 500 });
  }

  // Atomic claim: only one request can move the project into "processing",
  // so parallel calls (two tabs, a refresh) never run the analysis twice.
  const [claimed] = await db
    .update(projects)
    .set({
      status: "processing",
      progressStep: "Starting analysis",
      progressPercent: 30,
      errorMessage: null,
    })
    .where(
      and(
        eq(projects.id, project.id),
        eq(projects.userId, userId),
        or(
          eq(projects.status, "queued"),
          and(eq(projects.status, "failed"), gt(projects.fileCount, 0)),
          and(
            eq(projects.status, "processing"),
            lt(
              projects.updatedAt,
              sql`now() - make_interval(secs => ${STALE_AFTER_SECONDS})`,
            ),
          ),
        ),
      ),
    )
    .returning({ id: projects.id });

  if (!claimed) {
    return alreadyRunning();
  }

  try {
    await runFullProjectAnalysis(userId, project.id);
    const updated = await readProgress(userId, project.id);
    return Response.json({
      ok: true,
      status: updated?.status ?? "completed",
      progressStep: updated?.progressStep,
      progressPercent: updated?.progressPercent,
    });
  } catch {
    // The pipeline already stored a generic, user-facing errorMessage.
    console.error("Analyze API error");
    const updated = await readProgress(userId, project.id);
    return Response.json(
      {
        ok: false,
        status: updated?.status ?? "failed",
        progressStep: updated?.progressStep,
        progressPercent: updated?.progressPercent,
        error: "Analysis failed.",
      },
      { status: 500 },
    );
  }
}
