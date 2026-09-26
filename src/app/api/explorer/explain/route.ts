import { and, eq } from "drizzle-orm";
import { generateText } from "ai";
import { z } from "zod";

import { projects } from "@/db/schema";
import { getLanguageModel } from "@/lib/ai/llm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { readProjectFile } from "@/lib/files/explorer";
import { assertChatRateLimit, RateLimitError } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

// Same question limit as the chat route (bounds the LLM cost per request).
const bodySchema = z.object({
  projectId: z.uuid(),
  filePath: z.string().trim().min(1).max(1024),
  question: z.string().trim().min(1).max(4000),
});

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return Response.json(
        { error: "projectId, filePath, and question are required." },
        { status: 400 },
      );
    }
    const { projectId, filePath, question } = parsed.data;

    const [project] = await db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, session.user.id)))
      .limit(1);
    if (!project) {
      return Response.json({ error: "Project not found" }, { status: 404 });
    }

    await assertChatRateLimit(session.user.id);

    const file = await readProjectFile(session.user.id, project.id, filePath);
    if (!file) {
      return Response.json({ error: "File not found" }, { status: 404 });
    }

    const truncated =
      file.content.length > 12000
        ? `${file.content.slice(0, 12000)}\n\n/* truncated for analysis */`
        : file.content;

    const { text } = await generateText({
      model: getLanguageModel(),
      prompt: [
        "You are an AI senior engineer helping a developer understand a single source file.",
        "Be concrete and concise. Cite symbols/functions from the file when useful.",
        "If something is unclear from this file alone, say so.",
        "",
        `Project: ${project.name}`,
        `File: ${file.relativePath}`,
        `Question: ${question}`,
        "",
        "File contents:",
        "```",
        truncated,
        "```",
      ].join("\n"),
    });

    return Response.json(
      {
        answer: text,
        filePath: file.relativePath,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof RateLimitError) {
      return Response.json({ error: error.message }, { status: 429 });
    }
    // Details stay in the server log, never in the response.
    console.error("Explorer explain API error");
    return Response.json(
      { error: "Failed to explain the selected file." },
      { status: 500 },
    );
  }
}
