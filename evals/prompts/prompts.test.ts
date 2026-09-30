import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { REVIEW_PROMPT_VERSION } from "@/modules/analysis";
import { CHAT_PROMPT_VERSION, EXPLAIN_PROMPT_VERSION } from "@/modules/chat";

// A prompt change must come with its eval (roadmap Phase 7). The CI has no
// LLM key, so it cannot run the LLM eval itself; instead, every prompt's
// version is recorded in evals/prompts.lock.json with the result file that
// measured it, and this check fails when a prompt changes without the lock.
//
// After editing a prompt: run its eval (RUN_LLM_EVAL=1 npm run eval), commit
// the result, and set the new version and that file in the lock.

type Lock = Record<string, { version: string; measuredBy: string | null; note?: string }>;

const lockPath = join(process.cwd(), "evals", "prompts.lock.json");
const lock = JSON.parse(readFileSync(lockPath, "utf8")) as Lock;

const current: Record<string, string> = {
  review: REVIEW_PROMPT_VERSION,
  chat: CHAT_PROMPT_VERSION,
  explain: EXPLAIN_PROMPT_VERSION,
};

describe("prompts.lock.json", () => {
  it.each(Object.keys(current))("records the current version of the %s prompt", (name) => {
    expect(
      lock[name]?.version,
      `The ${name} prompt changed (now ${current[name]}). Run its eval and update evals/prompts.lock.json.`,
    ).toBe(current[name]);
  });

  it("lists no prompt that does not exist", () => {
    expect(Object.keys(lock).sort()).toEqual(Object.keys(current).sort());
  });

  it.each(Object.keys(current))("points the %s prompt to a result that measured this version", (name) => {
    const measuredBy = lock[name]?.measuredBy;
    if (!measuredBy) return; // not measured yet (no eval for it so far)
    const file = join(process.cwd(), measuredBy);
    expect(existsSync(file), `${measuredBy} does not exist`).toBe(true);
    // Results from before prompt versions were recorded have no field to check.
    const recorded = (JSON.parse(readFileSync(file, "utf8")) as { promptVersions?: Record<string, string> })
      .promptVersions?.[name];
    if (recorded) expect(recorded, `${measuredBy} measured another version`).toBe(current[name]);
  });
});
