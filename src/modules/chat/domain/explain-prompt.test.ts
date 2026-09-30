import { describe, expect, it } from "vitest";

import { dataRules } from "@/shared/prompt-data";

import { explainInstructions } from "./explain-prompt";

describe("explainInstructions", () => {
  it("is the text the explain route sent before the prompt moved here", () => {
    const boundary = "0123456789abcdef";

    expect(explainInstructions(boundary)).toBe(
      [
        "You are an AI senior engineer helping a developer understand a single source file.",
        "Be concrete and concise. Cite symbols/functions from the file when useful.",
        "If something is unclear from this file alone, say so.",
        ...dataRules(boundary),
      ].join("\n"),
    );
  });
});
