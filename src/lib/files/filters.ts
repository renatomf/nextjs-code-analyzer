import {
  ALWAYS_EXCLUDE_DIR_NAMES,
  ALWAYS_EXCLUDE_FILE_NAMES,
  SENSITIVE_FILE_EXTENSIONS,
  SENSITIVE_FILE_NAMES,
  SOURCE_EXTENSIONS,
} from "@/lib/limits";
import ignore from "ignore";
import path from "path";

export type ExtractedFile = {
  relativePath: string;
  content: string;
  sizeBytes: number;
};

const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".svg",
  ".pdf",
  ".zip",
  ".gz",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".mp4",
  ".mp3",
  ".wasm",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
]);

function normalizeRelativePath(filePath: string): string {
  return filePath
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/")
    .replace(/^(\.\/)+/, "");
}

/**
 * Paths come from untrusted archives / repos. Reject anything that could
 * escape the extraction root (zip-slip) instead of silently rewriting it.
 */
export function isSafeRelativePath(filePath: string): boolean {
  const normalized = normalizeRelativePath(filePath);
  if (normalized.includes("\0")) return false;
  if (normalized.startsWith("/")) return false; // absolute (POSIX / UNC)
  if (/^[a-zA-Z]:/.test(normalized)) return false; // Windows drive
  return !normalized.split("/").some((part) => part === "..");
}

function isBinaryOrNonText(filePath: string): boolean {
  return BINARY_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function isSensitiveFile(baseName: string): boolean {
  const name = baseName.toLowerCase();
  if (name === ".env" || name.startsWith(".env.")) return true;
  if (SENSITIVE_FILE_NAMES.has(name)) return true;
  return SENSITIVE_FILE_EXTENSIONS.has(path.extname(name));
}

export function isSourceFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return SOURCE_EXTENSIONS.has(ext);
}

/**
 * Must be called for every entry before it is read, written to disk,
 * chunked or sent to the LLM. Unsafe paths are always skipped.
 */
export function shouldSkipPath(
  relativePath: string,
  gitignore?: ReturnType<typeof ignore>,
): boolean {
  const normalized = normalizeRelativePath(relativePath);
  if (!normalized || normalized.endsWith("/")) return true;
  if (!isSafeRelativePath(normalized)) return true;

  // Case-insensitive: archives built on Windows/macOS may vary the casing.
  const parts = normalized.toLowerCase().split("/");
  if (parts.some((part) => ALWAYS_EXCLUDE_DIR_NAMES.has(part))) return true;

  const baseName = parts[parts.length - 1] ?? "";
  if (ALWAYS_EXCLUDE_FILE_NAMES.has(baseName)) return true;
  if (isSensitiveFile(baseName)) return true;
  if (isBinaryOrNonText(normalized)) return true;
  if (gitignore?.ignores(normalized)) return true;

  return false;
}

export function createGitignoreFilter(gitignoreContent?: string) {
  const ig = ignore();
  if (gitignoreContent) {
    ig.add(gitignoreContent);
  }
  return ig;
}

export function normalizePath(filePath: string): string {
  return normalizeRelativePath(filePath);
}
