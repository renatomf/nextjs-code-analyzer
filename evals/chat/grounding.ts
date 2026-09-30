/** Deterministic checks on a chat answer (no second model judges it). */

const SOURCE_FILE = /[\w@.[\]/-]+\.(?:[cm]?[jt]sx?)\b/g;

// Library and runtime names that end in ".js" but are not files.
const NOT_A_FILE = /^(node|next|nuxt|nest|vue|react|express|angular|ember|backbone|three|d3|chart|socket\.io)\.js$/i;

/**
 * Models write typographic characters (gpt-oss: U+2011 non-breaking hyphens
 * inside file names, U+2019 apostrophes): read them as ASCII.
 */
export function normalize(text: string): string {
  return text.replace(/[‐-―−]/g, "-").replace(/[‘’ʼ]/g, "'");
}

export const basename = (path: string) => path.slice(path.lastIndexOf("/") + 1);

/** Source files the answer cites, as written (a full path or a file name). */
export function citations(answer: string): string[] {
  const found = [...normalize(answer).matchAll(SOURCE_FILE)].map((m) =>
    m[0].replace(/^\.\//, "").replace(/\.$/, ""),
  );
  return [...new Set(found.filter((name) => !NOT_A_FILE.test(name)))];
}

/** Whether a citation (full path or file name) refers to one of `paths`. */
export const refersTo = (cited: string, paths: Iterable<string>) =>
  [...paths].some((path) => path === cited || basename(path) === cited);

// Phrases that say the context is not enough (the chat answers in English).
const SOURCES = "(?:sources|snippets|code|files)";
const ABSTAINS = new RegExp(
  [
    `not (?:in|included in|present in|shown in|part of|covered by|found in) the (?:provided |retrieved )?${SOURCES}`,
    // "the snippets (you provided) do not contain any ..."
    `${SOURCES}(?: (?:you |that were |that you )?(?:provided|retrieved|shared|given))? (?:do(?:es)? not|don't|doesn't) (?:show|contain|include|mention|cover|define|reference)`,
    `no (?:relevant )?(?:code|sources?|snippets?|mention|reference)`,
    "insufficient",
    "(?:cannot|can't|could not|couldn't) (?:find|determine|tell|see|show|locate|answer)",
    "not enough (?:information|context)",
    "there is no",
  ].join("|"),
  "i",
);

/** Whether the answer says the retrieved sources fall short. */
export const abstains = (answer: string) => ABSTAINS.test(normalize(answer));
