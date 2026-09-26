import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { codeChunks, projects } from "@/db/schema";
import { getLanguageModel } from "@/lib/ai/llm";
import {
  buildChatSystemPrompt,
  extractLastUserText,
  retrieveChatContext,
  type ChatSource,
} from "@/lib/analysis/chat-rag";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { assertChatRateLimit, RateLimitError } from "@/lib/rate-limit";
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  safeValidateUIMessages,
  streamText,
  toUIMessageStream,
} from "ai";

export const runtime = "nodejs";
export const maxDuration = 60;

// Bounds the LLM / embedding cost of a single request.
const MAX_MESSAGES = 50;
const MAX_QUESTION_LENGTH = 4000;

const chatRequestSchema = z.object({
  projectId: z.uuid(),
  messages: z.array(z.unknown()).min(1).max(MAX_MESSAGES),
});

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = chatRequestSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return Response.json({ error: "Invalid request." }, { status: 400 });
    }

    const validated = await safeValidateUIMessages({
      messages: parsed.data.messages,
    });
    // Only the server writes the system prompt.
    if (
      !validated.success ||
      validated.data.some((message) => message.role === "system")
    ) {
      return Response.json({ error: "Invalid messages." }, { status: 400 });
    }
    const messages = validated.data;

    const [project] = await db
      .select({
        id: projects.id,
        name: projects.name,
        framework: projects.framework,
      })
      .from(projects)
      .where(
        and(
          eq(projects.id, parsed.data.projectId),
          eq(projects.userId, session.user.id),
        ),
      )
      .limit(1);

    if (!project) {
      return Response.json({ error: "Project not found" }, { status: 404 });
    }

    const [chunk] = await db
      .select({ id: codeChunks.id })
      .from(codeChunks)
      .where(eq(codeChunks.projectId, project.id))
      .limit(1);

    if (!chunk) {
      return Response.json(
        {
          error:
            "This project has no indexed code chunks yet. Finish knowledge building first.",
        },
        { status: 400 },
      );
    }

    await assertChatRateLimit(session.user.id);

    const question = extractLastUserText(messages);
    if (!question || question.length > MAX_QUESTION_LENGTH) {
      return Response.json(
        {
          error: question
            ? `Questions are limited to ${MAX_QUESTION_LENGTH} characters.`
            : "Could not find a user question in the messages.",
        },
        { status: 400 },
      );
    }

    const { chunks, sources } = await retrieveChatContext(
      session.user.id,
      project.id,
      question,
    );

    const result = streamText({
      model: getLanguageModel(),
      system: buildChatSystemPrompt({
        projectName: project.name,
        framework: project.framework,
        chunks,
      }),
      messages: await convertToModelMessages(messages),
    });

    // AI SDK 7: standalone helpers replace the deprecated
    // `result.toUIMessageStreamResponse()`.
    return createUIMessageStreamResponse({
      stream: toUIMessageStream({
        stream: result.stream,
        originalMessages: messages,
        messageMetadata: ({ part }): { sources: ChatSource[] } | undefined => {
          if (part.type === "finish") {
            return { sources };
          }
          return undefined;
        },
      }),
    });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return Response.json({ error: error.message }, { status: 429 });
    }

    // Details stay in the server log, never in the response.
    console.error("Chat API error");
    return Response.json(
      { error: "Failed to answer the question." },
      { status: 500 },
    );
  }
}
