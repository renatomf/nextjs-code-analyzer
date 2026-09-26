import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { projects } from "@/db/schema";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

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

    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, parsedId.data), eq(projects.userId, session.user.id)),
      columns: {
        id: true,
        name: true,
        status: true,
        progressStep: true,
        progressPercent: true,
        errorMessage: true,
        framework: true,
        fileCount: true,
      },
      with: { report: { columns: { healthScore: true } } },
    });

    if (!project) {
      return Response.json({ error: "Project not found" }, { status: 404 });
    }

    // Polled while the analysis runs: always return the live status.
    return Response.json(project, { headers: { "Cache-Control": "no-store" } });
  } catch {
    console.error("Project status API error");
    return Response.json({ error: "Failed to load the project status." }, { status: 500 });
  }
}
