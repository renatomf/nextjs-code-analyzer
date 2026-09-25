/**
 * Analysis size limits (same for every plan — they protect the worker,
 * not a billing tier).
 */
export const MAX_REPO_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB
export const MAX_FILE_COUNT = 1000;
export const MAX_FILE_SIZE_BYTES = 500 * 1024; // 500 KB
/** Raw ZIP entries (before filtering); bounds work on hostile archives. */
export const MAX_ZIP_ENTRIES = 50_000;

/** Must match `vector("embedding", { dimensions })` in `code_chunks`. */
export const EMBEDDING_DIMENSIONS = 384;

/** RAG retrieval size */
export const RAG_TOP_K = 8;

/** Source file extensions that are parsed and chunked */
export const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx"]);

/** Always-excluded path segments / filenames */
export const ALWAYS_EXCLUDE_DIR_NAMES = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "coverage",
  ".turbo",
  ".vercel",
  ".data",
]);

export const ALWAYS_EXCLUDE_FILE_NAMES = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lock",
  "bun.lockb",
]);

/**
 * Secret-bearing files: never read, chunked into `code_chunks` or sent to
 * the LLM. Matched case-insensitively against the file's base name.
 */
export const SENSITIVE_FILE_NAMES = new Set([
  ".npmrc",
  ".yarnrc.yml",
  ".netrc",
  ".pypirc",
  ".htpasswd",
  "credentials.json",
  "service-account.json",
  "id_rsa",
  "id_dsa",
  "id_ecdsa",
  "id_ed25519",
]);

export const SENSITIVE_FILE_EXTENSIONS = new Set([
  ".pem",
  ".key",
  ".p12",
  ".pfx",
  ".jks",
  ".keystore",
]);
