import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
// report.ts imports the DB and the LLM client; scoreFromIssues needs neither.
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/analysis/report-llm", () => ({ runLlmHealthReview: vi.fn() }));

import { scoreFromIssues } from "@/lib/analysis/report";
import type { ReportIssue } from "@/lib/analysis/report-types";

function issue(
  severity: ReportIssue["severity"],
  category: ReportIssue["category"] = "testing",
): ReportIssue {
  return { title: "t", description: "d", severity, category, filePath: null };
}

// Pins the current formula: base minus a linear, uncapped penalty per issue
// (critical 20, high 12, medium 6, low 2), clamped to 0..100. Phase 7 of the
// v2 roadmap replaces it (cap per rule / diminishing penalty, ADR 010); these
// tests are expected to change then.
describe("scoreFromIssues", () => {
  it("returns the base score when the category has no issues", () => {
    expect(scoreFromIssues(88, [], "architecture")).toBe(88);
  });

  it("subtracts the penalty of each severity", () => {
    const issues = [
      issue("critical"),
      issue("high"),
      issue("medium"),
      issue("low"),
    ];
    expect(scoreFromIssues(100, issues, "testing")).toBe(100 - 20 - 12 - 6 - 2);
  });

  it("only counts issues of the requested category", () => {
    const issues = [issue("critical", "security"), issue("low", "testing")];
    expect(scoreFromIssues(90, issues, "testing")).toBe(88);
    expect(scoreFromIssues(90, issues, "security")).toBe(70);
  });

  it("zeroes a category when one rule repeats (current, uncapped behavior)", () => {
    // Same shape as this repo's own report: base 40, eight "Critical area may
    // lack tests" findings plus one low-coverage finding.
    const issues = Array.from({ length: 9 }, () => issue("high"));
    expect(scoreFromIssues(40, issues, "testing")).toBe(0);
  });

  it("clamps and rounds the result to 0..100", () => {
    expect(scoreFromIssues(150, [], "testing")).toBe(100);
    expect(scoreFromIssues(72.6, [], "testing")).toBe(73);
    expect(scoreFromIssues(5, [issue("critical")], "testing")).toBe(0);
  });
});
