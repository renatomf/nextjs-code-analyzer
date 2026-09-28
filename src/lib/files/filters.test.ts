import {
  createGitignoreFilter,
  isSourceFile,
  shouldSkipPath,
} from "@/lib/files/filters";
import { describe, expect, it } from "vitest";

describe("isSourceFile", () => {
  it("accepts JS/TS extensions only", () => {
    expect(isSourceFile("src/app.ts")).toBe(true);
    expect(isSourceFile("src/app.tsx")).toBe(true);
    expect(isSourceFile("src/app.js")).toBe(true);
    expect(isSourceFile("src/app.jsx")).toBe(true);
    expect(isSourceFile("README.md")).toBe(false);
    expect(isSourceFile("styles.css")).toBe(false);
  });
});

describe("shouldSkipPath", () => {
  it("skips excluded directories and lockfiles", () => {
    expect(shouldSkipPath("node_modules/pkg/index.js")).toBe(true);
    expect(shouldSkipPath(".next/server.js")).toBe(true);
    expect(shouldSkipPath("package-lock.json")).toBe(true);
    expect(shouldSkipPath("yarn.lock")).toBe(true);
  });

  it("skips binaries and directories", () => {
    expect(shouldSkipPath("public/logo.png")).toBe(true);
    expect(shouldSkipPath("src/")).toBe(true);
  });

  it("keeps normal source paths", () => {
    expect(shouldSkipPath("src/lib/utils.ts")).toBe(false);
  });

  it("respects gitignore filter", () => {
    const ig = createGitignoreFilter("tmp/\n*.log\n");
    expect(shouldSkipPath("tmp/cache.ts", ig)).toBe(true);
    expect(shouldSkipPath("debug.log", ig)).toBe(true);
    expect(shouldSkipPath("src/app.ts", ig)).toBe(false);
  });
});
