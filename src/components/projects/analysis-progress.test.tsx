// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Characterization before `useAnalysisProgress` is extracted: start the
// analysis once, poll the status, stop polling when finished, redirect to
// the report, and retry after a failure.

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  push: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh, push: mocks.push }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children?: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/lib/actions/projects", () => ({ cancelAnalysis: vi.fn() }));

import { AnalysisProgress } from "@/components/projects/analysis-progress";

type Status = "queued" | "processing" | "completed" | "failed";

function progress(status: Status, percent: number, step: string | null = null) {
  return {
    id: "p1",
    name: "demo",
    status,
    progressStep: step,
    progressPercent: percent,
    errorMessage: null,
    framework: null,
    fileCount: 3,
    report: null,
  };
}

const json = (body: unknown, ok = true) => ({ ok, json: async () => body });

/** Routes fetch by URL: POST .../analyze and GET .../status. */
function serve(handlers: { analyze?: () => unknown; status?: () => unknown }) {
  mocks.fetch.mockImplementation(async (url: string) => {
    if (url.endsWith("/analyze")) return handlers.analyze?.() ?? json({ ok: true });
    if (url.endsWith("/status")) return handlers.status?.() ?? json(progress("processing", 40));
    throw new Error(`unexpected fetch ${url}`);
  });
}

const calls = (suffix: string) =>
  mocks.fetch.mock.calls.filter(([url]) => String(url).endsWith(suffix)).length;

const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.fetch.mockReset();
  mocks.refresh.mockReset();
  mocks.push.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("AnalysisProgress", () => {
  it("starts a queued analysis once and shows the polled progress", async () => {
    serve({ status: () => json(progress("processing", 65, "Generating embeddings")) });

    render(<AnalysisProgress projectId="p1" initial={progress("queued", 25)} />);
    await advance(0);

    expect(calls("/analyze")).toBe(1);
    expect(screen.getByText("Generating embeddings")).toBeTruthy();
    expect(screen.getByText("65%")).toBeTruthy();

    await advance(1500 * 3);
    expect(calls("/analyze")).toBe(1);
    expect(calls("/status")).toBeGreaterThanOrEqual(4);
  });

  it("does not start a run that is already in progress", async () => {
    serve({});

    render(<AnalysisProgress projectId="p1" initial={progress("processing", 40)} />);
    await advance(0);

    expect(calls("/analyze")).toBe(0);
  });

  it("stops polling when done, refreshes and redirects to the report", async () => {
    serve({ status: () => json(progress("completed", 100, "Complete")) });

    render(<AnalysisProgress projectId="p1" initial={progress("processing", 90)} />);
    await advance(0);

    expect(screen.getByText(/Analysis complete/)).toBeTruthy();
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(mocks.push).not.toHaveBeenCalled();

    const polls = calls("/status");
    await advance(1200);
    expect(mocks.push).toHaveBeenCalledWith("/projects/p1/report");

    await advance(1500 * 3);
    expect(calls("/status")).toBe(polls);
  });

  it("shows why it could not start, and retries on demand", async () => {
    serve({
      analyze: () =>
        json({ error: "Import failed before files were ready. Please create a new project." }, false),
      status: () => json(progress("queued", 25)),
    });

    render(<AnalysisProgress projectId="p1" initial={progress("queued", 25)} />);
    await advance(0);

    expect(screen.getByText(/Import failed before files were ready/)).toBeTruthy();
    const retry = screen.getByRole("button", { name: "Retry analysis" });

    await act(async () => {
      retry.click();
    });
    await advance(0);

    expect(calls("/analyze")).toBe(2);
  });
});
