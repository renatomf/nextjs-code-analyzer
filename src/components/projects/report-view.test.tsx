// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ReportIssue } from "@/lib/analysis/report-types";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children?: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import { ReportView } from "@/components/projects/report-view";

afterEach(cleanup);

const issue = (
  title: string,
  severity: ReportIssue["severity"],
  category: ReportIssue["category"],
  filePath: string | null = null,
): ReportIssue => ({ title, description: `${title} details`, severity, category, filePath });

const ISSUES = [
  issue("Low 1", "low", "codeQuality"),
  issue("Critical 1", "critical", "security", "src/config.ts"),
  issue("Medium 1", "medium", "performance"),
  issue("High 1", "high", "architecture"),
  issue("Medium 2", "medium", "testing"),
  issue("Low 2", "low", "testing"),
];

const PROPS = {
  healthScore: 72,
  categoryScores: { architecture: 80, security: 55, performance: 90, codeQuality: 70, testing: 65 },
  summaries: {
    architecture: "Layers are clear.",
    security: "One secret found.",
    performance: "Fast enough.",
    codeQuality: "Some large files.",
    testing: "Few tests.",
  },
  issues: ISSUES,
};

describe("ReportView", () => {
  it("shows the health score and every category with its score and summary", () => {
    render(<ReportView {...PROPS} projectId="p1" />);

    expect(screen.getByText("72")).toBeTruthy();
    for (const summary of Object.values(PROPS.summaries)) {
      expect(screen.getByText(summary)).toBeTruthy();
    }
    expect(screen.getAllByText("55/100")).toHaveLength(1);
  });

  it("orders the roadmap by severity", () => {
    render(<ReportView {...PROPS} projectId="p1" />);

    const roadmap = screen.getByRole("list");
    expect(
      within(roadmap)
        .getAllByRole("listitem")
        .map((item) => item.querySelector("p")?.textContent),
    ).toEqual(["Critical 1", "High 1", "Medium 1", "Medium 2", "Low 1", "Low 2"]);
  });

  it("shows the top five issues and links the owner to the rest", () => {
    render(<ReportView {...PROPS} projectId="p1" />);

    expect(screen.getByText("6 potential issues across all categories.")).toBeTruthy();
    expect(screen.getByText("High 1 details")).toBeTruthy();
    expect(screen.queryByText("Low 2 details")).toBeNull();
    expect(screen.getByRole("link", { name: "View all" }).getAttribute("href")).toBe(
      "/projects/p1/issues",
    );
    expect(screen.getByRole("link", { name: "src/config.ts" })).toBeTruthy();
  });

  it("links nowhere private in the public (shared) view", () => {
    render(<ReportView {...PROPS} />);

    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.getByText("src/config.ts")).toBeTruthy();
  });
});
