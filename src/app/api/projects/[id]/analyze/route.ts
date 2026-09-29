import { logger, requestIdFrom } from "@/shared/logger";
import { z } from "zod";

import { runFullProjectAnalysis } from "@/lib/analysis/pipeline";
import { auth } from "@/lib/auth";
import { assertRateLimit, RateLimitError } from "@/lib/rate-limit";
import { AnalysisCanceledError, analysisStart } from "@/modules/projects";
import {
  claimAnalysis,
  findAnalysisCandidate,
  readProgress,
} from "@/modules/projects/server";

export const runtime = "nodejs";
export const maxDuration = 300;

// Embeddings + LLM report: cost protection, keyed by userId.
const ANALYZE_MAX_PER_HOUR = 10;

type RouteContext = {
  params: Promise<{ id: string }>;
};

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

  const project = await findAnalysisCandidate(userId, parsedId.data);

  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  const start = analysisStart(project, new Date());

  if (start === "completed") {
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
  if (start === "running") {
    return alreadyRunning();
  }

  if (start === "import-failed") {
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
    logger.error("analysis.request_failed", { err: error, projectId: project.id, requestId: requestIdFrom(_request.headers) });
    return Response.json({ error: "Analysis failed." }, { status: 500 });
  }

  // Atomic claim: parallel calls (two tabs, a refresh) never run twice.
  const claimed = await claimAnalysis(userId, project.id);

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
  } catch (error) {
    const updated = await readProgress(userId, project.id);
    // Canceled = the project was deleted mid-run (its writes then fail).
    if (error instanceof AnalysisCanceledError || !updated) {
      return Response.json({ ok: false, canceled: true, status: "failed" });
    }

    // The pipeline already stored a generic, user-facing errorMessage.
    logger.error("analysis.request_failed", { err: error, projectId: project.id, requestId: requestIdFrom(_request.headers) });
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
