import { logger, requestIdFrom } from "@/shared/logger";
import { NextRequest } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { readProjectFile } from "@/lib/files/explorer";
import { findOwnedProject } from "@/modules/projects/server";

const querySchema = z.object({
  projectId: z.uuid(),
  file: z.string().min(1).max(1024),
});

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = querySchema.safeParse({
      projectId: request.nextUrl.searchParams.get("projectId"),
      file: request.nextUrl.searchParams.get("file"),
    });

    if (!parsed.success) {
      return Response.json(
        { error: "projectId and file are required" },
        { status: 400 },
      );
    }

    const { projectId, file: filePath } = parsed.data;

    const project = await findOwnedProject(session.user.id, projectId);

    if (!project) {
      return Response.json({ error: "Project not found" }, { status: 404 });
    }

    const file = await readProjectFile(session.user.id, project.id, filePath);
    if (!file) {
      return Response.json({ error: "File not found" }, { status: 404 });
    }

    // Private source code: never cache it in shared caches or the browser.
    return Response.json(file, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logger.error("explorer.file_failed", { err: error, requestId: requestIdFrom(request.headers) });
    return Response.json({ error: "Failed to load the file." }, { status: 500 });
  }
}
