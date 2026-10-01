import { generateObject, generateText, streamText } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { FAKE_CHAT_ANSWER } from "@/lib/ai/fake-llm";
import {
  getLanguageModel,
  getStructuredLanguageModel,
  isFakeLlmEnabled,
  languageModelId,
  structuredLanguageModelId,
} from "@/lib/ai/llm";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("fake LLM switch", () => {
  it("is off unless E2E_FAKE_LLM=1", () => {
    vi.stubEnv("E2E_FAKE_LLM", "");
    expect(isFakeLlmEnabled()).toBe(false);
  });

  it("refuses to run on Vercel", () => {
    vi.stubEnv("E2E_FAKE_LLM", "1");
    vi.stubEnv("VERCEL", "1");
    expect(() => isFakeLlmEnabled()).toThrow(/never be set on a Vercel/);
    expect(() => getLanguageModel()).toThrow(/never be set on a Vercel/);
  });

  it("names the model each call uses (recorded with its usage)", () => {
    vi.stubEnv("E2E_FAKE_LLM", "");
    vi.stubEnv("GROQ_MODEL", "");
    vi.stubEnv("GROQ_STRUCTURED_MODEL", "openai/gpt-oss-20b");
    // An empty variable is not set: same as the shell without it.
    delete process.env.GROQ_MODEL;
    expect(languageModelId()).toBe("openai/gpt-oss-120b");
    expect(structuredLanguageModelId()).toBe("openai/gpt-oss-20b");

    vi.stubEnv("E2E_FAKE_LLM", "1");
    vi.stubEnv("VERCEL", "");
    expect(languageModelId()).toBe("e2e-fake-model");
  });

  it("still requires GROQ_API_KEY when the fake is off", () => {
    vi.stubEnv("E2E_FAKE_LLM", "");
    vi.stubEnv("GROQ_API_KEY", "");
    expect(() => getLanguageModel()).toThrow(/GROQ_API_KEY/);
  });
});

// The fake must work with the real AI SDK calls the app makes.
describe("fake LLM with the real AI SDK", () => {
  it("answers generateObject with data that matches the schema", async () => {
    vi.stubEnv("E2E_FAKE_LLM", "1");
    vi.stubEnv("VERCEL", "");

    const { object } = await generateObject({
      model: getStructuredLanguageModel(),
      schema: z.object({
        architectureSummary: z.string(),
        issues: z.array(z.object({ severity: z.enum(["low", "high"]) })),
      }),
      prompt: "review",
    });

    expect(object.architectureSummary).toMatch(/Fake review/);
    expect(object.issues).toEqual([{ severity: "low" }]);
  });

  it("answers generateText and streamText with the fixed chat answer", async () => {
    vi.stubEnv("E2E_FAKE_LLM", "1");
    vi.stubEnv("VERCEL", "");

    const { text } = await generateText({ model: getLanguageModel(), prompt: "q" });
    expect(text).toBe(FAKE_CHAT_ANSWER);

    const result = streamText({ model: getLanguageModel(), prompt: "q" });
    expect(await result.text).toBe(FAKE_CHAT_ANSWER);
  });
});
