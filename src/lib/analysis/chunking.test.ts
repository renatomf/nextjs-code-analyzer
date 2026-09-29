import { describe, expect, it } from "vitest";

import { chunkProjectFiles, chunkSourceFile } from "@/lib/analysis/chunking";

// Characterization tests: they pin the current behavior, including known
// debts (TD-07, TD-08). Fixing a debt should change the matching test on
// purpose, not by accident.

const MAX_CHUNK_CHARS = 400 * 4; // TARGET_MAX_TOKENS estimated as chars / 4

function bigFunction(name: string, lines: number): string {
  const body = Array.from(
    { length: lines },
    (_, i) => `  const value${i} = compute(${i}, "some padding text");`,
  ).join("\n");
  return `function ${name}() {\n${body}\n}`;
}

describe("chunkSourceFile", () => {
  it("returns nothing for empty or blank files", () => {
    expect(chunkSourceFile("src/a.ts", "")).toEqual([]);
    expect(chunkSourceFile("src/a.ts", "  \n\n ")).toEqual([]);
  });

  it("keeps the real line range of a declaration", () => {
    const source = "\n\n\n\nfunction add(a: number, b: number) {\n  return a + b;\n}\n";
    const [chunk] = chunkSourceFile("src/math.ts", source);

    expect(chunk).toMatchObject({ filePath: "src/math.ts", startLine: 5, endLine: 7 });
    expect(chunk.content).toBe(
      "function add(a: number, b: number) {\n  return a + b;\n}",
    );
  });

  it("chunks the inner declaration of an export (without the export keyword)", () => {
    const [chunk] = chunkSourceFile("src/a.ts", "export function run() {\n  return 1;\n}\n");
    expect(chunk.content.startsWith("function run()")).toBe(true);
  });

  it("merges adjacent small declarations of the same file", () => {
    const source = [
      "const a = 1;",
      "type Id = string;",
      "interface User { id: Id }",
      "function f() { return a; }",
    ].join("\n");
    const chunks = chunkSourceFile("src/small.ts", source);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ startLine: 1, endLine: 4 });
    for (const piece of ["const a", "type Id", "interface User", "function f"]) {
      expect(chunks[0].content).toContain(piece);
    }
  });

  it("splits oversized declarations into overlapping, bounded pieces", () => {
    const source = bigFunction("huge", 120);
    const chunks = chunkSourceFile("src/huge.ts", source);
    const totalLines = source.split("\n").length;

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].startLine).toBe(1);
    for (const [i, chunk] of chunks.entries()) {
      expect(chunk.content.length).toBeLessThanOrEqual(MAX_CHUNK_CHARS);
      expect(chunk.endLine).toBeLessThanOrEqual(totalLines);
      if (i > 0) {
        const previous = chunks[i - 1];
        // Consecutive pieces overlap and move forward.
        expect(chunk.startLine).toBeLessThanOrEqual(previous.endLine);
        expect(chunk.startLine).toBeGreaterThanOrEqual(previous.startLine);
      }
    }
    // Nothing from the function is lost.
    const joined = chunks.map((chunk) => chunk.content).join("\n");
    expect(joined).toContain("value0 =");
    expect(joined).toContain("value119 =");
  });

  it("parses TSX components", () => {
    const source =
      "export function Card({ title }: { title: string }) {\n  return <div className=\"card\">{title}</div>;\n}\n";
    const [chunk] = chunkSourceFile("src/card.tsx", source);
    expect(chunk.content).toContain('<div className="card">');
  });

  it("parses plain JavaScript", () => {
    const [chunk] = chunkSourceFile("src/a.js", "function hello() {\n  return 'hi';\n}\n");
    expect(chunk.content).toContain("function hello()");
  });

  it("falls back to the whole file when no declaration is found", () => {
    const source = "import { a } from './a';\nimport b from './b';\n";
    expect(chunkSourceFile("src/index.ts", source)).toEqual([
      { filePath: "src/index.ts", content: source, startLine: 1, endLine: 3 },
    ]);
  });

  it("drops a file made only of tiny expression statements", () => {
    // Known behavior: tiny expressions are skipped as noise, so this file is
    // not indexed at all.
    expect(chunkSourceFile("src/side-effect.ts", "setup();\n")).toEqual([]);
  });

  it("drops imports when the file has other declarations (TD-07)", () => {
    const source = "import { db } from './db';\n\nexport function load() {\n  return db;\n}\n";
    const joined = chunkSourceFile("src/load.ts", source)
      .map((chunk) => chunk.content)
      .join("\n");

    expect(joined).toContain("function load()");
    expect(joined).not.toContain("import { db }");
  });

  it("indexes class methods twice: inside the class and on their own (TD-08)", () => {
    const source = [
      "class Service {",
      "  run() {",
      "    return 'unique-method-body';",
      "  }",
      "}",
    ].join("\n");
    const occurrences = chunkSourceFile("src/service.ts", source)
      .map((chunk) => chunk.content.split("unique-method-body").length - 1)
      .reduce((sum, count) => sum + count, 0);

    expect(occurrences).toBe(2);
  });
});

describe("chunkProjectFiles", () => {
  it("chunks every file and keeps each chunk's file path", () => {
    const chunks = chunkProjectFiles([
      { relativePath: "src/a.ts", content: "function a() { return 1; }\n" },
      { relativePath: "src/b.ts", content: "function b() { return 2; }\n" },
      { relativePath: "src/empty.ts", content: "" },
    ]);

    expect(chunks.map((chunk) => chunk.filePath)).toEqual(["src/a.ts", "src/b.ts"]);
  });
});
