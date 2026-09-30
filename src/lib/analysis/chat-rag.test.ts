import { describe, expect, it, vi } from "vitest";

// chat-rag imports the ingestion module (database, model); these helpers
// need neither.
vi.mock("@/modules/ingestion/server", () => ({}));

import { extractLastUserText } from "@/lib/analysis/chat-rag";

describe("extractLastUserText", () => {
  it("takes the last user message, ignoring the assistant's", () => {
    expect(
      extractLastUserText([
        { role: "user", parts: [{ type: "text", text: "first" }] },
        { role: "assistant", parts: [{ type: "text", text: "answer" }] },
        { role: "user", parts: [{ type: "text", text: "second" }] },
        { role: "assistant", parts: [{ type: "text", text: "pending" }] },
      ]),
    ).toBe("second");
  });

  it("joins the text parts and skips other part types", () => {
    expect(
      extractLastUserText([
        {
          role: "user",
          parts: [
            { type: "text", text: "line 1" },
            { type: "file" },
            { type: "text", text: "line 2" },
          ],
        },
      ]),
    ).toBe("line 1\nline 2");
  });

  it("accepts plain string and array content, trimmed", () => {
    expect(extractLastUserText([{ role: "user", content: "  hi  " }])).toBe("hi");
    expect(
      extractLastUserText([{ role: "user", content: [{ type: "text", text: " a " }] }]),
    ).toBe("a");
  });

  it("skips empty user messages and returns '' when there is no question", () => {
    expect(
      extractLastUserText([
        { role: "user", parts: [{ type: "text", text: "real" }] },
        { role: "user", parts: [{ type: "text", text: "   " }] },
      ]),
    ).toBe("real");
    expect(extractLastUserText([{ role: "assistant", content: "x" }])).toBe("");
  });
});
