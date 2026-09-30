// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ReportIssue } from "@/lib/analysis/report-types";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children?: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import { IssueCard } from "@/components/projects/issue-card";

afterEach(cleanup);

const grouped: ReportIssue = {
  title: "Critical areas may lack tests (2)",
  description: "No nearby test file was found for these paths.",
  severity: "high",
  category: "testing",
  filePath: "src/auth/login.ts",
  rule: "untested-critical-path",
  occurrences: [
    { filePath: "src/auth/login.ts", severity: "high", title: "Critical area may lack tests", description: "d" },
    { filePath: "src/billing/pay.ts", severity: "high", title: "Critical area may lack tests", description: "d" },
  ],
};

describe("IssueCard", () => {
  it("lists every occurrence of a grouped finding, linked for the owner", () => {
    render(<IssueCard issue={grouped} projectId="p1" />);

    expect(screen.getByText("Critical areas may lack tests (2)")).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "src/billing/pay.ts" }).getAttribute("href")).toBe(
      "/projects/p1/explorer?file=src%2Fbilling%2Fpay.ts",
    );
  });

  it("shows the occurrences as plain text in the public view", () => {
    render(<IssueCard issue={grouped} />);

    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.getByText("src/billing/pay.ts")).toBeTruthy();
  });

  it("keeps a single finding's file line as before", () => {
    const { occurrences, ...single } = grouped;
    void occurrences;
    render(<IssueCard issue={{ ...single, title: "Critical area may lack tests" }} projectId="p1" />);

    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.getByRole("link", { name: "src/auth/login.ts" })).toBeTruthy();
  });
});
