// What a file is, from its path alone (stored paths always use "/").

/** Last path segment. */
export function basename(filePath: string): string {
  return filePath.slice(filePath.lastIndexOf("/") + 1);
}

/** Directory with its trailing "/" ("" at the root). */
export function dirname(filePath: string): string {
  return filePath.slice(0, filePath.lastIndexOf("/") + 1);
}

export function isTestFile(filePath: string): boolean {
  const base = basename(filePath).toLowerCase();
  return (
    base.includes(".test.") ||
    base.includes(".spec.") ||
    filePath.includes("__tests__/") ||
    // `test/` and `tests/` folders, at the root or nested (`src/test/`).
    /(^|\/)tests?\//.test(filePath)
  );
}

/** Words of a path: `src/lib/oauthIcons.tsx` → src, lib, oauth, icons, tsx. */
export function pathWords(filePath: string): string[] {
  return filePath
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[/._\-\s]+/)
    .filter(Boolean);
}
