import type { PlanConfig } from "../domain/plan";

/**
 * Plan limits and copy from the environment (overridable without code
 * changes), with the same defaults as before the module existed.
 */

type EnvSource = Record<string, string | undefined>;

function envInt(env: EnvSource, name: string, fallback: number): number {
  const raw = env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function envText(env: EnvSource, name: string, fallback: string): string {
  const raw = env[name]?.trim();
  return raw || fallback;
}

// Token budgets (roadmap Phase 4), sized from the evals of 2026-09-30
// (evals/results): a report used up to ~8.5k tokens (x2 with the JSON retry)
// and a chat answer up to ~4.3k. Free = 5 reports + ~25 chat answers; premium
// is 10x. Recalibrate from the llm_calls table once real usage builds up.
export function readPlanConfig(env: EnvSource = process.env): PlanConfig {
  return {
    free: {
      label: envText(env, "NEXT_PUBLIC_PLAN_FREE_LABEL", "Free"),
      priceLabel: envText(env, "NEXT_PUBLIC_PLAN_FREE_PRICE_LABEL", "$0"),
      analysesPerDay: envInt(env, "PLAN_FREE_ANALYSES_PER_DAY", 5),
      chatPerHour: envInt(env, "PLAN_FREE_CHAT_PER_HOUR", 20),
      maxProjects: envInt(env, "PLAN_FREE_MAX_PROJECTS", 5),
      llmTokensPerDay: envInt(env, "PLAN_FREE_LLM_TOKENS_PER_DAY", 200_000),
    },
    premium: {
      label: envText(env, "NEXT_PUBLIC_PLAN_PREMIUM_LABEL", "Premium"),
      // Empty = filled from Stripe (see getPlansWithStripePricing).
      priceLabel: envText(env, "NEXT_PUBLIC_PLAN_PREMIUM_PRICE_LABEL", ""),
      analysesPerDay: envInt(env, "PLAN_PREMIUM_ANALYSES_PER_DAY", 50),
      chatPerHour: envInt(env, "PLAN_PREMIUM_CHAT_PER_HOUR", 200),
      llmTokensPerDay: envInt(env, "PLAN_PREMIUM_LLM_TOKENS_PER_DAY", 2_000_000),
    },
  };
}
