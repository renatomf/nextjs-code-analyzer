"use client";

import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import {
  oneDark,
  oneLight,
} from "react-syntax-highlighter/dist/esm/styles/prism";

function languageFromPath(filePath: string): string {
  if (filePath.endsWith(".tsx")) return "tsx";
  if (filePath.endsWith(".ts")) return "typescript";
  if (filePath.endsWith(".jsx")) return "jsx";
  if (filePath.endsWith(".js")) return "javascript";
  if (filePath.endsWith(".json")) return "json";
  if (filePath.endsWith(".css")) return "css";
  if (filePath.endsWith(".md")) return "markdown";
  return "text";
}

export function CodeViewer({
  filePath,
  content,
}: {
  filePath: string;
  content: string;
}) {
  const { resolvedTheme } = useTheme();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  // The server can't know the visitor's theme, so render light until mounted
  // to keep the first client render identical to the server HTML.
  const isDark = mounted ? resolvedTheme === "dark" : false;
  const style = isDark ? oneDark : oneLight;
  const lineCount = content.length === 0 ? 1 : content.split("\n").length;

  return (
    <div className="ca-panel">
      <div className="flex items-center justify-between gap-3 border-b border-(--ca-night-line) bg-(--ca-night) px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="ca-dots" aria-hidden>
            <i />
            <i />
            <i />
          </span>
          <p className="truncate font-mono text-[13px] text-white/80">
            {filePath}
          </p>
        </div>
        <p className="shrink-0 font-mono text-[11px] text-white/45">
          {lineCount} lines
        </p>
      </div>

      <div className={cnScroll()}>
        <SyntaxHighlighter
          language={languageFromPath(filePath)}
          style={style}
          showLineNumbers
          wrapLongLines={false}
          PreTag="pre"
          lineNumberStyle={{
            minWidth: "2.75rem",
            paddingRight: "1rem",
            color: "var(--ca-soft)",
            fontSize: "13px",
          }}
          customStyle={{
            margin: 0,
            borderRadius: 0,
            fontSize: "14.5px",
            lineHeight: 1.7,
            padding: "1.1rem 1rem 1.25rem",
            background: "var(--ca-card)",
            minHeight: "18rem",
            whiteSpace: "pre",
            overflowX: "auto",
            wordBreak: "normal",
            overflowWrap: "normal",
          }}
          codeTagProps={{
            style: {
              fontFamily:
                "var(--font-intel-mono), ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
              fontSize: "14.5px",
              lineHeight: 1.7,
              whiteSpace: "pre",
              display: "block",
            },
          }}
        >
          {content}
        </SyntaxHighlighter>
      </div>
    </div>
  );
}

// `--ca-card` already switches with the theme, so no dark/light branch here.
function cnScroll() {
  return ["max-h-[min(70vh,44rem)] overflow-auto", "bg-(--ca-card)"].join(" ");
}
