"use client";

import { CodeViewer } from "@/components/projects/code-viewer";
import { FileAiPanel } from "@/components/projects/file-ai-panel";
import { FileTree } from "@/components/projects/file-tree";
import type { FileTreeNode } from "@/lib/files/explorer";
import { useRef, useState } from "react";

export function CodeExplorer({
  projectId,
  tree,
  initialFile,
  initialContent,
}: {
  projectId: string;
  tree: FileTreeNode[];
  initialFile: string | null;
  initialContent: string | null;
}) {
  const [selectedPath, setSelectedPath] = useState<string | null>(initialFile);
  const [content, setContent] = useState<string | null>(initialContent);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Only the latest click may update the viewer: older requests are aborted
  // so a slow response can't show file A under file B's name.
  const requestRef = useRef<AbortController | null>(null);

  async function loadFile(path: string) {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;

    setSelectedPath(path);
    setLoading(true);
    setError(null);

    // Keep the URL shareable without remounting the explorer tree.
    window.history.replaceState(
      null,
      "",
      `/projects/${projectId}/explorer?file=${encodeURIComponent(path)}`,
    );

    try {
      const response = await fetch(
        `/api/explorer/file?projectId=${encodeURIComponent(projectId)}&file=${encodeURIComponent(path)}`,
        { signal: controller.signal },
      );
      const data = (await response.json()) as {
        content?: string;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to load file");
      }
      setContent(data.content ?? "");
    } catch (err) {
      if (controller.signal.aborted) return;
      setContent(null);
      setError(err instanceof Error ? err.message : "Failed to load file");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(240px,280px)_minmax(0,1fr)_minmax(0,300px)]">
      <section className="ca-panel min-w-0">
        <div className="flex items-center justify-between border-b border-(--ca-line) px-3.5 py-2.5">
          <p className="font-mono text-[0.68rem] tracking-[0.04em] text-(--ca-muted) uppercase">
            Files
          </p>
          <span className="bg-(--ca-green)/15 px-2 py-0.5 font-mono text-[10px] text-(--ca-ink) tabular-nums">
            {countFiles(tree)}
          </span>
        </div>
        <FileTree
          tree={tree}
          selectedPath={selectedPath}
          onSelect={(path) => {
            void loadFile(path);
          }}
        />
      </section>

      <section className="min-w-0">
        {loading ? (
          <div className="ca-panel flex min-h-72 items-center justify-center p-8 text-sm text-(--ca-muted)">
            Loading file...
          </div>
        ) : error ? (
          <div className="ca-panel flex min-h-72 items-center justify-center p-8 text-sm text-destructive">
            {error}
          </div>
        ) : selectedPath && content != null ? (
          <CodeViewer filePath={selectedPath} content={content} />
        ) : (
          <div className="ca-panel flex min-h-72 items-center justify-center p-8 text-sm text-(--ca-muted)">
            Select a file to view its code.
          </div>
        )}
      </section>

      <section className="min-w-0">
        <FileAiPanel
          // Remount per file: clears the previous answer and drops late replies.
          key={selectedPath ?? ""}
          projectId={projectId}
          filePath={selectedPath}
        />
      </section>
    </div>
  );
}

function countFiles(nodes: FileTreeNode[]): number {
  let total = 0;
  for (const node of nodes) {
    if (node.type === "file") total += 1;
    else if (node.children) total += countFiles(node.children);
  }
  return total;
}
