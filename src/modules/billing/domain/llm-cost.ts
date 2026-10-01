/**
 * What an LLM call costs at the provider's list price (roadmap Phase 4).
 * On Groq's free tier the real cost is zero; the estimate is what budgets
 * and a paid tier would be measured in. Pure.
 */

export type LlmFeature = "report" | "chat" | "explain";

export type LlmUsage = { inputTokens: number; outputTokens: number };

// USD per million tokens. Source: Groq model docs
// (https://console.groq.com/docs/models), read on 2026-10-01. A model that is
// not listed has no estimate (null), never a guessed one.
const PRICE_PER_MILLION: Record<string, { input: number; output: number }> = {
  "openai/gpt-oss-120b": { input: 0.15, output: 0.6 },
  "openai/gpt-oss-20b": { input: 0.075, output: 0.3 },
};

/** Estimated cost in millionths of a US dollar, or null for an unpriced model. */
export function estimateCostMicroUsd(model: string, usage: LlmUsage): number | null {
  const price = PRICE_PER_MILLION[model];
  if (!price) return null;
  // Price per million tokens = micro-dollars per token.
  return Math.round(usage.inputTokens * price.input + usage.outputTokens * price.output);
}
