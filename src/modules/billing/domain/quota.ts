import { DomainError } from "@/shared/errors";

import type { PlanCatalog, PlanLimits } from "./plan";

export class BillingLimitError extends DomainError {
  code: "analyses" | "projects" | "chat" | "llm_tokens";
  upgradeRequired = true;
  /** Short heading and body for UIs that lay the notice out (see `message`). */
  title?: string;
  detail?: string;
  /** False when the user is already on the paid plan. */
  canUpgrade = true;

  constructor(
    code: BillingLimitError["code"],
    message: string,
    notice?: { title: string; detail: string; canUpgrade: boolean },
  ) {
    super(message);
    this.name = "BillingLimitError";
    this.code = code;
    if (notice) {
      this.title = notice.title;
      this.detail = notice.detail;
      this.canUpgrade = notice.canUpgrade;
    }
  }
}

function limitError(
  code: BillingLimitError["code"],
  notice: { title: string; detail: string; canUpgrade: boolean },
) {
  return new BillingLimitError(code, `${notice.title}. ${notice.detail}`, notice);
}

/** The quota day starts at 00:00 UTC (product rule, TD-25). */
export function quotaDayStart(now: Date): Date {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export function assertProjectQuota(
  catalog: PlanCatalog,
  limits: PlanLimits,
  projectCount: number,
): void {
  if (projectCount >= limits.maxProjects) {
    throw limitError("projects", {
      title: "Project limit reached",
      detail: `You have ${projectCount} of ${limits.maxProjects} projects on the ${limits.label} plan. Upgrade to ${catalog.premium.label} for unlimited projects, or delete a project to free a slot.`,
      canUpgrade: true,
    });
  }
}

export function assertAnalysisQuota(
  catalog: PlanCatalog,
  limits: PlanLimits,
  usedToday: number,
): void {
  if (usedToday >= limits.analysesPerDay) {
    const paid = catalog.premium;
    const canUpgrade = limits.label === catalog.free.label;
    throw limitError("analyses", {
      title: "Daily analysis limit reached",
      detail: `You've used all ${limits.analysesPerDay} analyses for today on the ${limits.label} plan. ${
        canUpgrade
          ? `Upgrade to ${paid.label} for up to ${paid.analysesPerDay} a day, or try again tomorrow.`
          : "Try again tomorrow."
      }`,
      canUpgrade,
    });
  }
}

/**
 * The daily LLM token budget (roadmap Phase 4). A soft cap: it is checked
 * before each call, so the calls already in flight may go over it; the
 * per-call output caps and the rate limits bound by how much.
 */
export function assertLlmTokenBudget(
  catalog: PlanCatalog,
  limits: PlanLimits,
  usedToday: number,
): void {
  if (usedToday >= limits.llmTokensPerDay) {
    const canUpgrade = limits.label === catalog.free.label;
    throw limitError("llm_tokens", {
      title: "Daily AI usage limit reached",
      detail: `You've used today's AI budget on the ${limits.label} plan. ${
        canUpgrade
          ? `Upgrade to ${catalog.premium.label} for a larger budget, or try again tomorrow.`
          : "Try again tomorrow."
      }`,
      canUpgrade,
    });
  }
}
