"use client";

import { ActionAlert } from "@/components/shared/action-alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ChatSource } from "@/modules/chat";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { ArrowUp, Square } from "lucide-react";
import {
  FormEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

function getMessageText(message: UIMessage): string {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => ("text" in part ? part.text : ""))
    .join("");
}

function getMessageSources(message: UIMessage): ChatSource[] {
  const metadata = message.metadata as { sources?: ChatSource[] } | undefined;
  return metadata?.sources ?? [];
}

export function ProjectChat({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const [input, setInput] = useState("");

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: { projectId },
      }),
    [projectId],
  );

  const { messages, sendMessage, status, error, stop, clearError } = useChat({
    transport,
  });

  const busy = status === "submitted" || status === "streaming";

  // Auto-grow: fit the box to its text (Shift+Enter adds lines) up to the CSS
  // max-height, then it scrolls inside. Shrinks back when text is removed.
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const box = inputRef.current;
    if (!box) return;
    box.style.height = "auto";
    box.style.height = `${box.scrollHeight}px`;
  }, [input]);

  // Keep the newest message in view (the messages area scrolls inside).
  const messagesRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const area = messagesRef.current;
    if (area) area.scrollTop = area.scrollHeight;
  }, [messages]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    clearError();
    setInput("");
    await sendMessage({ text });
  }

  return (
    // Fills the rest of the screen (`data-chat-fill` makes the app shell
    // exactly screen-high), like Claude: the input sits at the bottom edge and,
    // as it grows, pushes up by shrinking the stretched messages area.
    <div data-chat-fill className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="shrink-0 rounded-[0.375rem] border border-(--ca-line) bg-(--ca-card) px-4 py-3 text-sm text-(--ca-muted)">
        Ask questions about{" "}
        <span className="font-medium text-foreground">{projectName}</span>.
        Answers are grounded in retrieved code chunks from this project.
      </div>

      {/* Takes the remaining height and scrolls inside; follows the newest
          message. */}
      <div
        ref={messagesRef}
        // min-h-32: on very short screens the page scrolls instead of the
        // conversation collapsing.
        className="flex min-h-32 flex-1 flex-col gap-4 overflow-y-auto rounded-[0.375rem] border border-(--ca-line) bg-(--ca-card) p-4"
      >
        {messages.length === 0 ? (
          <div className="space-y-2 text-sm text-(--ca-muted)">
            <p>Try asking:</p>
            <ul className="list-disc space-y-1 ps-5">
              <li>Explain the authentication flow.</li>
              <li>Where is user authorization handled?</li>
              <li>How does payment processing work?</li>
            </ul>
          </div>
        ) : (
          messages.map((message) => {
            const text = getMessageText(message);
            const sources = getMessageSources(message);
            const isUser = message.role === "user";

            return (
              <div
                key={message.id}
                className={`max-w-[90%] rounded-[0.375rem] px-4 py-3 text-sm ${
                  isUser
                    ? "ms-auto bg-primary text-primary-foreground"
                    : "me-auto min-w-64 bg-(--ca-paper-2) shadow-[inset_0_0_0_1px_var(--ca-line)] dark:bg-(--ca-green-soft)"
                }`}
              >
                <p className="mb-1 text-xs opacity-70">
                  {isUser ? "You" : "AI Engineer"}
                </p>
                <div className="whitespace-pre-wrap">
                  {text || (busy && !isUser ? "Thinking..." : "")}
                </div>
                {!isUser && sources.length > 0 ? (
                  <div className="mt-3 border-t border-(--ca-line) pt-2">
                    <p className="mb-1 text-xs font-medium opacity-80">
                      Sources
                    </p>
                    <ul className="space-y-1 font-mono text-xs opacity-90">
                      {sources.map((source, index) => (
                        <li key={`${source.filePath}-${index}`}>
                          {source.filePath}
                          {source.startLine && source.endLine
                            ? `:${source.startLine}-${source.endLine}`
                            : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      {error ? (
        <ActionAlert
          title="Chat error"
          message={error.message}
          onDismiss={clearError}
          className="shrink-0"
        />
      ) : null}

      {/* Claude-style input: grows with the text up to a max, then scrolls,
          stays editable while the answer streams (sending waits for it),
          keeps focus. One icon button inside, bottom-right: send (arrow), or
          stop (square) while answering. */}
      <form onSubmit={onSubmit} className="relative shrink-0">
        <Textarea
          ref={inputRef}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            // Enter sends, Shift+Enter adds a new line. Ignored while an IME
            // is composing (e.g. accents), so Enter only confirms the letter.
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              if (!busy) event.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder="Ask about this codebase..."
          rows={1}
          maxLength={4000}
          autoFocus
          // field-sizing-fixed: the height is set by the effect above.
          // pr-14 keeps the text clear of the button.
          className="field-sizing-fixed max-h-36 rounded-[0.375rem] min-h-20 resize-none overflow-y-auto pr-14"
        />
        <div className="absolute right-2 bottom-2">
          {busy ? (
            <Button
              type="button"
              size="icon-sm"
              className="[--ca-corner:transparent]!"
              aria-label="Stop response"
              title="Stop"
              onClick={() => stop()}
            >
              <Square className="fill-current" />
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon-sm"
              className="[--ca-corner:transparent]!"
              aria-label="Send message"
              title="Send (Enter)"
              disabled={!input.trim()}
            >
              <ArrowUp />
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
