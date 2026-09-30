// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The explorer loads a file per click; only the latest click may update the
// viewer (earlier requests are aborted), and the URL stays shareable.

vi.mock("@/components/projects/file-tree", () => ({
  FileTree: ({ onSelect }: { onSelect: (path: string) => void }) => (
    <div>
      {["src/a.ts", "src/b.ts"].map((path) => (
        <button key={path} type="button" onClick={() => onSelect(path)}>
          {path}
        </button>
      ))}
    </div>
  ),
}));
vi.mock("@/components/projects/code-viewer", () => ({
  CodeViewer: ({ filePath, content }: { filePath: string; content: string }) => (
    <pre data-testid="viewer">{`${filePath}: ${content}`}</pre>
  ),
}));
vi.mock("@/components/projects/file-ai-panel", () => ({ FileAiPanel: () => null }));

import { CodeExplorer } from "@/components/projects/code-explorer";

type Pending = { url: string; signal: AbortSignal; resolve: (body: unknown, ok?: boolean) => void };
let pending: Pending[] = [];

beforeEach(() => {
  pending = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (url: string, init: { signal: AbortSignal }) =>
        new Promise((resolve, reject) => {
          init.signal.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
          pending.push({
            url,
            signal: init.signal,
            resolve: (body, ok = true) => resolve({ ok, json: async () => body }),
          });
        }),
    ),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderExplorer() {
  render(<CodeExplorer projectId="p1" tree={[]} initialFile={null} initialContent={null} />);
}

const click = (name: string) => act(async () => screen.getByRole("button", { name }).click());

describe("CodeExplorer", () => {
  it("loads the clicked file and keeps the URL shareable", async () => {
    renderExplorer();

    await click("src/a.ts");
    expect(screen.getByText("Loading file...")).toBeTruthy();
    expect(pending[0].url).toBe("/api/explorer/file?projectId=p1&file=src%2Fa.ts");
    expect(window.location.search).toBe("?file=src%2Fa.ts");

    await act(async () => pending[0].resolve({ content: "export const a = 1;" }));

    expect(screen.getByTestId("viewer").textContent).toBe("src/a.ts: export const a = 1;");
  });

  it("shows only the latest file when an earlier request answers late", async () => {
    renderExplorer();

    await click("src/a.ts");
    await click("src/b.ts");
    expect(pending[0].signal.aborted).toBe(true);

    await act(async () => pending[1].resolve({ content: "b content" }));
    await act(async () => pending[0].resolve({ content: "a content" }));

    expect(screen.getByTestId("viewer").textContent).toBe("src/b.ts: b content");
  });

  it("shows the server's error for a file that cannot be loaded", async () => {
    renderExplorer();

    await click("src/a.ts");
    await act(async () => pending[0].resolve({ error: "File not found" }, false));

    expect(screen.getByText("File not found")).toBeTruthy();
  });
});
