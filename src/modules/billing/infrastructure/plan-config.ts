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

export function readPlanConfig(env: EnvSource = process.env): PlanConfig {
  return {
    free: {
      label: envText(env, "NEXT_PUBLIC_PLAN_FREE_LABEL", "Free"),
      priceLabel: envText(env, "NEXT_PUBLIC_PLAN_FREE_PRICE_LABEL", "$0"),
      analysesPerDay: envInt(env, "PLAN_FREE_ANALYSES_PER_DAY", 5),
      chatPerHour: envInt(env, "PLAN_FREE_CHAT_PER_HOUR", 20),
      maxProjects: envInt(env, "PLAN_FREE_MAX_PROJECTS", 5),
    },
    premium: {
      label: envText(env, "NEXT_PUBLIC_PLAN_PREMIUM_LABEL", "Premium"),
      // Empty = filled from Stripe (see getPlansWithStripePricing).
      priceLabel: envText(env, "NEXT_PUBLIC_PLAN_PREMIUM_PRICE_LABEL", ""),
      analysesPerDay: envInt(env, "PLAN_PREMIUM_ANALYSES_PER_DAY", 50),
      chatPerHour: envInt(env, "PLAN_PREMIUM_CHAT_PER_HOUR", 200),
    },
  };
}
