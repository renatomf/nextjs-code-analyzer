import { dataRules } from "@/shared/prompt-data";
import { promptVersion } from "@/shared/prompt-version";

/**
 * The explorer's "explain this file" prompt (roadmap Phase 7: prompts in
 * versioned files). A change gives a new EXPLAIN_PROMPT_VERSION, which
 * evals/prompts.lock.json must record.
 */
export const EXPLAIN_PROMPT = [
  "You are an AI senior engineer helping a developer understand a single source file.",
  "Be concrete and concise. Cite symbols/functions from the file when useful.",
  "If something is unclear from this file alone, say so.",
] as const;

export const EXPLAIN_PROMPT_VERSION = promptVersion(EXPLAIN_PROMPT);

/** The instructions sent to the model: the prompt plus the data rules (TD-28). */
export function explainInstructions(boundary: string): string {
  return [...EXPLAIN_PROMPT, ...dataRules(boundary)].join("\n");
}
