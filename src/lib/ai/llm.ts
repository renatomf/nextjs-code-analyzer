import { createGroq } from "@ai-sdk/groq";

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
  const groq = createGroqClient();
  const modelId = process.env.GROQ_MODEL ?? "openai/gpt-oss-120b";
  return groq(modelId);
}

export function getStructuredLanguageModel() {
  const groq = createGroqClient();
  const modelId = process.env.GROQ_STRUCTURED_MODEL ?? "openai/gpt-oss-120b";
  return groq(modelId);
}
