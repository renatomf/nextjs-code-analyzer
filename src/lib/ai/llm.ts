import { createGroq } from "@ai-sdk/groq";

import { createFakeLanguageModel } from "@/lib/ai/fake-llm";

/**
 * E2E tests run the production build (`next start`, NODE_ENV=production) with
 * a deterministic fake model instead of Groq. The flag is refused on Vercel,
 * so a misconfigured deployment fails loudly instead of answering users with
 * canned text.
 */
export function isFakeLlmEnabled(): boolean {
  if (process.env.E2E_FAKE_LLM !== "1") return false;
  if (process.env.VERCEL) {
    throw new Error("E2E_FAKE_LLM must never be set on a Vercel deployment.");
  }
  return true;
}

function createGroqClient() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GROQ_API_KEY is not set. Get a free key at https://console.groq.com/keys",
    );
  }
  return createGroq({ apiKey });
}

export function getLanguageModel() {
  if (isFakeLlmEnabled()) return createFakeLanguageModel();
  const groq = createGroqClient();
  const modelId = process.env.GROQ_MODEL ?? "openai/gpt-oss-120b";
  return groq(modelId);
}

export function getStructuredLanguageModel() {
  if (isFakeLlmEnabled()) return createFakeLanguageModel();
  const groq = createGroqClient();
  const modelId = process.env.GROQ_STRUCTURED_MODEL ?? "openai/gpt-oss-120b";
  return groq(modelId);
}
