import { describe, expect, it } from "vitest";

import { abstains, citations, refersTo } from "./grounding";

describe("citations", () => {
  it("finds paths with line ranges, plain paths and file names, once each", () => {
    const answer =
      "The query is built in `routes/search.ts:L23-L25`, see also routes/search.ts and ./lib/insecurity.ts. " +
      "The model lives in user.ts; the page is src/app/r/[token]/page.tsx.";

    expect(citations(answer)).toEqual([
      "routes/search.ts",
      "lib/insecurity.ts",
      "user.ts",
      "src/app/r/[token]/page.tsx",
    ]);
  });

  it("ignores words that only look like files", () => {
    expect(citations("It uses Node.js and Next.js with express.")).toEqual([]);
  });
});

describe("refersTo", () => {
  it("matches a full path or a file name", () => {
    const paths = ["routes/search.ts", "models/user.ts"];

    expect(refersTo("routes/search.ts", paths)).toBe(true);
    expect(refersTo("user.ts", paths)).toBe(true);
    expect(refersTo("lib/user.ts", paths)).toBe(false);
  });
});

describe("abstains", () => {
  it.each([
    "The provided snippets do not show any GraphQL resolvers.",
    "There is no Kafka producer in the retrieved code.",
    "I cannot find where SMS messages are sent; the sources are insufficient.",
    "This is not included in the provided sources.",
  ])("recognizes: %s", (answer) => {
    expect(abstains(answer)).toBe(true);
  });

  it("does not flag a direct answer", () => {
    expect(abstains("The search builds a raw SQL query from the criteria in routes/search.ts:L23.")).toBe(false);
  });
});
