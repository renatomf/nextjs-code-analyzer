"use client";

import type { FileTreeNode } from "@/lib/files/explorer";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  ChevronRight,
  FileCode2,
  FileJson,
  FileText,
  Folder,
  FolderOpen,
} from "lucide-react";
import { useMemo, useState } from "react";

function FileGlyph({ name, className }: { name: string; className?: string }) {
  if (/\.(tsx?|jsx?|mjs|cjs)$/i.test(name)) {
    return <FileCode2 className={className} aria-hidden />;
  }
  if (/\.json$/i.test(name)) {
    return <FileJson className={className} aria-hidden />;
  }
  return <FileText className={className} aria-hidden />;
}

// Kudos is monochrome: source files in ink, everything else muted.
function fileIconClass(name: string) {
  if (/\.(tsx?|jsx?)$/i.test(name)) return "text-(--ca-ink)";
  return "text-(--ca-muted)";
}

function isPathInsideFolder(folderPath: string, filePath: string | null) {
  if (!filePath) return false;
  return filePath === folderPath || filePath.startsWith(`${folderPath}/`);
}

function TreeNode({
  node,
  depth,
  selectedPath,
  onSelect,
}: {
  node: FileTreeNode;
  depth: number;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}) {
  const containsSelected = isPathInsideFolder(node.path, selectedPath);
  // null = not toggled yet: open when it holds the selected file or is one of
  // the top two levels. Once clicked, the user's choice wins (before, the
  // selected file's folders were forced open and could never collapse).
  const [manualOpen, setManualOpen] = useState<boolean | null>(null);
  const open = manualOpen ?? (containsSelected || depth < 2);
  const pad = 10 + depth * 14;

  if (node.type === "file") {
    const selected = selectedPath === node.path;

    return (
      <button
        type="button"
        onClick={() => onSelect(node.path)}
        aria-current={selected ? "true" : undefined}
        // The open file looks like the hovered row.
        className={cn(
          "group flex w-full items-center gap-2 rounded-sm py-1.5 pr-2 text-left text-[13px] text-(--ca-ink)/90 transition-colors hover:bg-(--ca-paper)",
          selected && "bg-(--ca-paper)",
        )}
        style={{ paddingInlineStart: pad }}
        title={node.path}
      >
        <FileGlyph
          name={node.name}
          className={cn("size-3.5 shrink-0", fileIconClass(node.name))}
        />
        <span className="min-w-0 truncate">{node.name}</span>
      </button>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setManualOpen(!open)}
        // Folders are all ink (name, chevron and icon), open or closed.
        className="flex w-full items-center gap-1.5 rounded-sm py-1.5 pr-2 text-left text-[13px] font-semibold text-(--ca-ink) transition-colors hover:bg-(--ca-paper)"
        style={{ paddingInlineStart: pad }}
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown
            className="size-3.5 shrink-0 text-(--ca-ink)"
            aria-hidden
          />
        ) : (
          <ChevronRight
            className="size-3.5 shrink-0 text-(--ca-ink)"
            aria-hidden
          />
        )}
        {open ? (
          <FolderOpen
            className="size-3.5 shrink-0 text-(--ca-ink)"
            aria-hidden
          />
        ) : (
          <Folder
            className="size-3.5 shrink-0 text-(--ca-ink)"
            aria-hidden
          />
        )}
        <span className="min-w-0 truncate">{node.name}</span>
      </button>
      {open
        ? node.children?.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelect={onSelect}
            />
          ))
        : null}
    </div>
  );
}

export function FileTree({
  tree,
  selectedPath,
  onSelect,
}: {
  tree: FileTreeNode[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
}) {
  const isEmpty = useMemo(() => tree.length === 0, [tree]);

  if (isEmpty) {
    return (
      <p className="p-4 text-sm text-(--ca-muted)">
        No files available.
      </p>
    );
  }

  return (
    // Fills the Files panel (fixed height) and scrolls inside.
    <div className="min-h-0 flex-1 overflow-auto p-2">
      {tree.map((node) => (
        <TreeNode
          key={node.path}
          node={node}
          depth={0}
          selectedPath={selectedPath}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
