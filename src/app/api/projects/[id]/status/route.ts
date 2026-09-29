import { logger, requestIdFrom } from "@/shared/logger";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { getProjectProgress } from "@/modules/projects/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/** Lightweight status endpoint for the analysis progress page. */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const parsedId = z.uuid().safeParse(id);
    if (!parsedId.success) {
      return Response.json({ error: "Project not found" }, { status: 404 });
    }

    const project = await getProjectProgress(session.user.id, parsedId.data);

    if (!project) {
      return Response.json({ error: "Project not found" }, { status: 404 });
    }

    // Polled while the analysis runs: always return the live status.
    return Response.json(project, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logger.error("project.status_failed", { err: error, requestId: requestIdFrom(_request.headers) });
    return Response.json({ error: "Failed to load the project status." }, { status: 500 });
  }
}
