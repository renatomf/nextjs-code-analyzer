import { logger, requestIdFrom } from "@/shared/logger";
import { z } from "zod";

import { newDataBoundary } from "@/shared/prompt-data";

import { getLanguageModel, languageModelId } from "@/lib/ai/llm";
import { auth } from "@/lib/auth";
import { assertChatRateLimit, RateLimitError } from "@/lib/rate-limit";
import {
  buildChatSystemPrompt,
  extractLastUserText,
  type ChatSource,
} from "@/modules/chat";
import { recordLlmCall } from "@/modules/billing/server";
import { retrieveChatContext } from "@/modules/chat/server";
import { getChatProject } from "@/modules/projects/server";
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

    const project = await getChatProject(session.user.id, parsed.data.projectId);

    if (!project) {
      return Response.json({ error: "Project not found" }, { status: 404 });
    }

    if (!project.hasChunks) {
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

    // Usage recorded when the stream ends, fails or is aborted (Phase 4);
    // recording never throws.
    const llmCall = {
      userId: session.user.id,
      projectId: project.id,
      feature: "chat" as const,
      model: languageModelId(),
    };
    const llmStarted = performance.now();
    const elapsed = () => performance.now() - llmStarted;

    const result = streamText({
      model: getLanguageModel(),
      instructions: buildChatSystemPrompt({
        projectName: project.name,
        framework: project.framework,
        chunks,
        boundary: newDataBoundary(),
      }),
      messages: await convertToModelMessages(messages),
      onEnd: ({ usage }) => recordLlmCall({ ...llmCall, usage, latencyMs: elapsed(), ok: true }),
      onError: () => recordLlmCall({ ...llmCall, usage: null, latencyMs: elapsed(), ok: false }),
      onAbort: () => recordLlmCall({ ...llmCall, usage: null, latencyMs: elapsed(), ok: false }),
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
    logger.error("chat.failed", { err: error, requestId: requestIdFrom(request.headers) });
    return Response.json(
      { error: "Failed to answer the question." },
      { status: 500 },
    );
  }
}
