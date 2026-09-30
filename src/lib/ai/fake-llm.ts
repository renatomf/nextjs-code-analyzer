import type { LanguageModelV4Usage } from "@ai-sdk/provider";
import { MockLanguageModelV4, simulateReadableStream } from "ai/test";

// Deterministic stand-in for the LLM, used only by the E2E tests (see
// isFakeLlmEnabled in llm.ts): no network, no API key, no quota, same output
// on every run.

export const FAKE_CHAT_ANSWER =
  "This is a fake answer from the E2E test model: the project exports helpers.";

const FAKE_REPORT = {
  architectureSummary: "Fake review: modules are small and focused.",
  securitySummary: "Fake review: no obvious secrets in the sampled code.",
  performanceSummary: "Fake review: no hot loops in the sampled code.",
  issues: [
    {
      title: "Fake issue from the E2E test model",
      description: "Deterministic issue so the report page has content.",
      severity: "low",
      category: "architecture",
      filePath: null,
      quote: null,
    },
  ],
};

const usage: LanguageModelV4Usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 10, text: 10, reasoning: 0 },
};

const finishReason = { unified: "stop" as const, raw: "stop" };

export function createFakeLanguageModel() {
  return new MockLanguageModelV4({
    provider: "e2e-fake",
    modelId: "e2e-fake-model",
    // generateObject asks for JSON; generateText gets plain text.
    doGenerate: async (options) => ({
      content: [
        {
          type: "text",
          text:
            options.responseFormat?.type === "json"
              ? JSON.stringify(FAKE_REPORT)
              : FAKE_CHAT_ANSWER,
        },
      ],
      finishReason,
      usage,
      warnings: [],
    }),
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: "stream-start", warnings: [] },
          { type: "text-start", id: "t1" },
          ...FAKE_CHAT_ANSWER.split(" ").map((word, i) => ({
            type: "text-delta" as const,
            id: "t1",
            delta: i === 0 ? word : ` ${word}`,
          })),
          { type: "text-end", id: "t1" },
          { type: "finish", finishReason, usage },
        ],
      }),
    }),
  });
}
