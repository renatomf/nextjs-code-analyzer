/** Deterministic checks on a chat answer (no second model judges it). */

const SOURCE_FILE = /[\w@.[\]/-]+\.(?:[cm]?[jt]sx?)\b/g;

export const basename = (path: string) => path.slice(path.lastIndexOf("/") + 1);

// Library and runtime names that end in ".js" but are not files.
const NOT_A_FILE = /^(node|next|nuxt|nest|vue|react|express|angular|ember|backbone|three|d3|chart|socket\.io)\.js$/i;

/** Source files the answer cites, as written (a full path or a file name). */
export function citations(answer: string): string[] {
  const found = [...answer.matchAll(SOURCE_FILE)].map((m) => m[0].replace(/^\.\//, "").replace(/\.$/, ""));
  return [...new Set(found.filter((name) => !NOT_A_FILE.test(name)))];
}

/** Whether a citation (full path or file name) refers to one of `paths`. */
export const refersTo = (cited: string, paths: Iterable<string>) =>
  [...paths].some((path) => path === cited || basename(path) === cited);

// Phrases that say the context is not enough (the chat answers in English).
const ABSTAINS =
  /\b(not (?:in|included in|present in|shown in|part of|covered by|found in) the (?:provided |retrieved )?(?:sources|snippets|code)|(?:sources|snippets|code) (?:do(?:es)? not|don't|doesn't) (?:show|contain|include|mention|cover)|no (?:relevant )?(?:code|sources?|snippets?|mention|reference)|insufficient|cannot (?:find|determine|tell|see)|can't (?:find|determine|tell|see)|not enough (?:information|context)|there is no)\b/i;

/** Whether the answer says the retrieved sources fall short. */
export const abstains = (answer: string) => ABSTAINS.test(answer);
