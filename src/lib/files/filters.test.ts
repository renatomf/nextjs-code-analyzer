import {
  createGitignoreFilter,
  isSafeRelativePath,
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

describe("isSafeRelativePath", () => {
  it("accepts normal relative paths", () => {
    for (const value of ["src/app.ts", "./src/app.ts", "src\\lib\\app.ts", "..config/app.ts"]) {
      expect(isSafeRelativePath(value)).toBe(true);
    }
  });

  it("rejects paths that could escape the extraction root", () => {
    for (const value of [
      "../evil.ts",
      "src/../../evil.ts",
      "src\\..\\..\\evil.ts",
      "/etc/passwd",
      "\\\\server\\share\\x.ts",
      "C:/Windows/x.ts",
      "c:\\x.ts",
      "src/app.ts\0.png",
    ]) {
      expect(isSafeRelativePath(value)).toBe(false);
    }
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

  it.each([
    ".yarn/sdks/typescript/lib/tsserver.js",
    ".nuxt/components.d.ts",
    ".output/server/index.mjs",
    ".svelte-kit/generated/root.js",
    "apps/web/.cache/bundle.js",
    ".claude/hooks/format.js",
    ".cursor/rules/check.ts",
    ".vscode/extension.js",
    ".husky/commit-msg.js",
  ])("skips tool folders and generated output: %s", (path) => {
    expect(shouldSkipPath(path)).toBe(true);
  });

  it("keeps normal source paths", () => {
    expect(shouldSkipPath("src/lib/utils.ts")).toBe(false);
    // Folders that may hold real code stay in.
    expect(shouldSkipPath("docs/examples/client.ts")).toBe(false);
    expect(shouldSkipPath(".github/scripts/release.js")).toBe(false);
  });

  it("skips secret-bearing files in any folder and casing", () => {
    for (const value of [
      ".env",
      ".env.local",
      "apps/web/.ENV.production",
      "config/.npmrc",
      "keys/id_rsa",
      "certs/server.pem",
      "gcp/service-account.json",
    ]) {
      expect(shouldSkipPath(value)).toBe(true);
    }
  });

  it("skips unsafe paths and excluded dirs regardless of casing", () => {
    expect(shouldSkipPath("../src/app.ts")).toBe(true);
    expect(shouldSkipPath("Node_Modules/pkg/index.js")).toBe(true);
  });

  it("respects gitignore filter", () => {
    const ig = createGitignoreFilter("tmp/\n*.log\n");
    expect(shouldSkipPath("tmp/cache.ts", ig)).toBe(true);
    expect(shouldSkipPath("debug.log", ig)).toBe(true);
    expect(shouldSkipPath("src/app.ts", ig)).toBe(false);
  });
});
