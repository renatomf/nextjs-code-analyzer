import { DomainError } from "@/shared/errors";

import type { LlmFeature } from "./llm-cost";

const MESSAGES: Record<LlmFeature, string> = {
  report: "The AI review is temporarily unavailable. Try again later.",
  chat: "The AI chat is temporarily unavailable. Try again later.",
  explain: "AI explanations are temporarily unavailable. Try again later.",
};

/** An LLM feature turned off by its kill switch (roadmap Phase 4). */
export class LlmUnavailableError extends DomainError {
  status = 503;
  feature: LlmFeature;

  constructor(feature: LlmFeature) {
    super(MESSAGES[feature]);
    this.name = "LlmUnavailableError";
    this.feature = feature;
  }
}
