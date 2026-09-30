/**
 * Version of a prompt: a hash of its fixed text (roadmap Phase 7). Any edit
 * to the wording gives a new version, which evals/prompts.lock.json must
 * record together with the eval that measured it. Pure (FNV-1a, 32 bits):
 * enough to notice a change, and it runs anywhere, the browser included.
 */
export function promptVersion(lines: readonly string[]): string {
  let hash = 0x811c9dc5;
  for (const char of lines.join("\n")) {
    const code = char.codePointAt(0)!;
    hash ^= code;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
