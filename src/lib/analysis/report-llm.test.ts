import type { LanguageModelV4Usage } from "@ai-sdk/provider";
import { APICallError } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Each call takes the next answer; an Error answer is thrown.
const model = vi.hoisted(() => ({
  answers: [] as unknown[],
  calls: 0,
  lastOptions: undefined as unknown,
}));

vi.mock("@/lib/ai/llm", () => ({
  getStructuredLanguageModel: () =>
    new MockLanguageModelV4({
      doGenerate: async (options) => {
        model.lastOptions = options;
        const answer = model.answers[Math.min(model.calls, model.answers.length - 1)];
        model.calls += 1;
        if (answer instanceof Error) throw answer;
        return answer as never;
      },
    }),
}));

import { runLlmHealthReview } from "./report-llm";

const usage: LanguageModelV4Usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 10, text: 10, reasoning: 0 },
};

const answer = (report: object) => ({
  content: [{ type: "text", text: JSON.stringify(report) }],
  finishReason: { unified: "stop", raw: "stop" },
  usage,
  warnings: [],
});

const apiError = (statusCode: number, code: string) =>
  new APICallError({
    message: code,
    url: "https://api.groq.com/openai/v1/chat/completions",
    requestBodyValues: {},
    statusCode,
    responseBody: JSON.stringify({ error: { code } }),
    isRetryable: false,
  });

const chunks = [
  {
    filePath: "src/db.ts",
    content: 'const rows = await db.query("SELECT * FROM t WHERE id = " + id);',
    startLine: 1,
    endLine: 1,
  },
];

const report = {
  architectureSummary: "a",
  securitySummary: "s",
  performanceSummary: "p",
  issues: [
    {
      title: "SQL injection",
      description: "d",
      severity: "critical",
      category: "security",
      filePath: "src/db.ts",
      quote: 'await db.query("SELECT * FROM t WHERE id = " + id)',
    },
    {
      title: "Invented",
      description: "d",
      severity: "high",
      category: "security",
      filePath: "src/db.ts",
      quote: "eval(input)",
    },
  ],
};

const review = () => runLlmHealthReview({ projectName: "p", framework: null, chunks });
const failure = () => review().then(() => null, (error: unknown) => error);

describe("runLlmHealthReview", () => {
  beforeEach(() => {
    model.answers = [];
    model.calls = 0;
  });

  it("keeps verified issues, with their lines, and counts the dropped ones", async () => {
    model.answers = [answer(report)];

    const result = await review();

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ title: "SQL injection", evidence: { startLine: 1 } });
    expect(result.droppedUnverified).toBe(1);
    expect(result.sentFilePaths).toEqual(["src/db.ts"]);
  });

  it("asks the provider for JSON with the report schema, at temperature 0", async () => {
    model.answers = [answer(report)];

    await review();

    // Groq turns a JSON response format with a schema into strict json_schema.
    expect(model.lastOptions).toMatchObject({
      temperature: 0,
      responseFormat: {
        type: "json",
        schema: {
          type: "object",
          required: expect.arrayContaining(["issues"]),
          additionalProperties: false,
        },
      },
    });
  });

  it("sends the review prompt word for word (a change here is a prompt change)", async () => {
    model.answers = [answer(report)];

    await review();

    const { prompt } = model.lastOptions as {
      prompt: Array<{ role: string; content: string | Array<{ type: string; text?: string }> }>;
    };
    // The data boundary is random per request.
    const text = (content: string | Array<{ type: string; text?: string }>) =>
      (typeof content === "string" ? content : content.map((part) => part.text ?? "").join(""))
        .replace(/[0-9a-f]{16}/g, "<boundary>");
    expect(prompt.map((message) => `[${message.role}]\n${text(message.content)}`).join("\n\n")).toMatchSnapshot();
  });

  it("caps the number of issues and the length of their texts", async () => {
    const [valid] = report.issues;
    const issues = Array.from({ length: 12 }, (_, i) => ({
      ...valid,
      title: `${i} ${"t".repeat(300)}`,
      description: "d".repeat(2_000),
    }));
    model.answers = [answer({ ...report, issues })];

    const result = await review();

    expect(result.issues).toHaveLength(10);
    expect(result.issues[0].title).toHaveLength(200);
    expect(result.issues[0].description).toHaveLength(1_000);
  });

  it("retries once when the model writes invalid JSON", async () => {
    model.answers = [apiError(400, "json_validate_failed"), answer(report)];

    await expect(review()).resolves.toMatchObject({ droppedUnverified: 1 });
    expect(model.calls).toBe(2);
  });

  it("gives up after the retry", async () => {
    model.answers = [apiError(400, "json_validate_failed")];

    expect(await failure()).toBeInstanceOf(APICallError);
    expect(model.calls).toBe(2);
  });

  it("does not retry other errors", async () => {
    model.answers = [apiError(401, "invalid_api_key")];

    expect(await failure()).toBeInstanceOf(APICallError);
    expect(model.calls).toBe(1);
  });
});
