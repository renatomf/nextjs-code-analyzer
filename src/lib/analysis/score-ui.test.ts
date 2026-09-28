import { scoreLabel, scoreTextClass, scoreTone } from "@/lib/analysis/score-ui";
import { describe, expect, it } from "vitest";

describe("scoreTone", () => {
  it("maps score bands", () => {
    expect(scoreTone(90)).toBe("good");
    expect(scoreTone(75)).toBe("good");
    expect(scoreTone(50)).toBe("ok");
    expect(scoreTone(49)).toBe("poor");
    expect(scoreTone(0)).toBe("poor");
  });

  it("returns neutral for missing scores", () => {
    expect(scoreTone(null)).toBe("neutral");
    expect(scoreTone(undefined)).toBe("neutral");
    expect(scoreTone(Number.NaN)).toBe("neutral");
  });
});

describe("score helpers", () => {
  it("exposes labels and classes per tone", () => {
    expect(scoreLabel("good")).toBe("Healthy");
    expect(scoreLabel("ok")).toBe("Needs attention");
    expect(scoreLabel("poor")).toBe("At risk");
    expect(scoreLabel("neutral")).toBe("Unknown");
    expect(scoreTextClass("good")).toContain("ca-tone-good");
    expect(scoreTextClass("neutral")).toContain("ca-tone-neutral");
  });
});
