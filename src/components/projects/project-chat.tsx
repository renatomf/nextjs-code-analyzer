"use client";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ChatSource } from "@/lib/analysis/chat-rag";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { FormEvent, useMemo, useState } from "react";

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

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    clearError();
    setInput("");
    await sendMessage({ text });
  }

  return (
    <div className="flex min-h-[70vh] flex-col gap-4">
      <div className="border border-(--ca-line) bg-(--ca-card) px-4 py-3 text-sm text-(--ca-muted)">
        Ask questions about{" "}
        <span className="font-medium text-foreground">{projectName}</span>.
        Answers are grounded in retrieved code chunks from this project.
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto border border-(--ca-line) p-4">
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
                className={`max-w-[90%] rounded-md px-4 py-3 text-sm ${
                  isUser
                    ? "ms-auto bg-primary text-primary-foreground"
                    : "me-auto bg-(--ca-card) shadow-[inset_0_0_0_1px_var(--ca-line)]"
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
        <p className="border border-destructive/30 border-l-2 border-l-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">{error.message}</p>
      ) : null}

      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <Textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask about this codebase..."
          rows={3}
          maxLength={4000}
          disabled={busy}
        />
        <div className="flex items-center gap-2">
          <Button type="submit" disabled={busy || !input.trim()}>
            {busy ? "Sending..." : "Send"}
          </Button>
          {busy ? (
            <Button type="button" variant="outline" onClick={() => stop()}>
              Stop
            </Button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
