import { describe, expect, it } from "vitest";

import { promptVersion } from "./prompt-version";

describe("promptVersion", () => {
  it("is the same for the same text", () => {
    expect(promptVersion(["Be concise.", "Cite files."])).toBe(promptVersion(["Be concise.", "Cite files."]));
  });

  it("changes when a word, the order or a line break changes", () => {
    const base = promptVersion(["Be concise.", "Cite files."]);

    expect(promptVersion(["Be concise.", "Cite the files."])).not.toBe(base);
    expect(promptVersion(["Cite files.", "Be concise."])).not.toBe(base);
    expect(promptVersion(["Be concise. Cite files."])).not.toBe(base);
  });

  it("is 8 hex characters", () => {
    expect(promptVersion(["x"])).toMatch(/^[0-9a-f]{8}$/);
    expect(promptVersion([])).toMatch(/^[0-9a-f]{8}$/);
  });
});
