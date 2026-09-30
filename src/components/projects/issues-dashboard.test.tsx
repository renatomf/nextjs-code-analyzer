// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// In the app, Next keeps useSearchParams in sync with history.replaceState;
// here it reads the jsdom URL directly.
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

import { IssuesDashboard } from "@/components/projects/issues-dashboard";
import type { ReportIssue } from "@/lib/analysis/report-types";

beforeEach(() => window.history.replaceState(null, "", "/projects/p1/issues"));
afterEach(cleanup);

const issue = (
  title: string,
  severity: ReportIssue["severity"],
  category: ReportIssue["category"],
): ReportIssue => ({ title, description: "d", severity, category, filePath: null });

const ISSUES = [
  issue("Secret in config", "critical", "security"),
  issue("Missing auth check", "high", "security"),
  issue("Huge component", "medium", "codeQuality"),
  issue("Slow query", "medium", "performance"),
  issue("Naming", "low", "codeQuality"),
];

const shownTitles = () =>
  screen.queryAllByRole("listitem").map((item) => item.querySelector("p")?.textContent);

describe("IssuesDashboard", () => {
  it("lists every issue, most severe first, with a count per severity", () => {
    render(<IssuesDashboard projectId="p1" issues={ISSUES} />);

    expect(screen.getByText(/Showing 5 of 5 issue\(s\)/)).toBeTruthy();
    expect(shownTitles()).toEqual([
      "Secret in config",
      "Missing auth check",
      "Huge component",
      "Slow query",
      "Naming",
    ]);
    expect(screen.getByRole("button", { name: /Medium \(2\)/ })).toBeTruthy();
  });

  it("filters by a severity chip, and a second click clears the filter", async () => {
    const user = userEvent.setup();
    render(<IssuesDashboard projectId="p1" issues={ISSUES} />);
    const medium = screen.getByRole("button", { name: /Medium \(2\)/ });

    await user.click(medium);

    expect(medium.getAttribute("aria-pressed")).toBe("true");
    expect(shownTitles()).toEqual(["Huge component", "Slow query"]);
    expect(screen.getByText(/Showing 2 of 5 issue\(s\)/)).toBeTruthy();

    await user.click(medium);

    expect(medium.getAttribute("aria-pressed")).toBe("false");
    expect(shownTitles()).toHaveLength(5);
  });

  it("keeps the active filter in the URL, and drops it when cleared", async () => {
    const user = userEvent.setup();
    render(<IssuesDashboard projectId="p1" issues={ISSUES} />);
    const high = screen.getByRole("button", { name: /High \(1\)/ });

    await user.click(high);
    expect(window.location.search).toBe("?severity=high");

    await user.click(high);
    expect(window.location.search).toBe("");
    expect(window.location.pathname).toBe("/projects/p1/issues");
  });

  it("opens with the filters from a shared link", () => {
    window.history.replaceState(null, "", "/projects/p1/issues?severity=medium&category=performance");

    render(<IssuesDashboard projectId="p1" issues={ISSUES} />);

    expect(shownTitles()).toEqual(["Slow query"]);
    expect(
      screen.getByRole("button", { name: /Medium \(2\)/ }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("ignores unknown filter values from the URL", () => {
    window.history.replaceState(null, "", "/projects/p1/issues?severity=bogus&category=<script>");

    render(<IssuesDashboard projectId="p1" issues={ISSUES} />);

    expect(shownTitles()).toHaveLength(5);
  });

  it("says so when no issue matches", () => {
    render(<IssuesDashboard projectId="p1" issues={[]} />);

    expect(screen.getByText("No issues match the current filters.")).toBeTruthy();
  });
});
