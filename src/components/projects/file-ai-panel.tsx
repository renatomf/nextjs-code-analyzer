"use client";

import { ActionAlert } from "@/components/ui/action-alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FormEvent, useState } from "react";

const QUICK_PROMPTS = [
  { label: "Explain this file", prompt: "Explain this file." },
  {
    label: "Find potential issues",
    prompt: "Find potential issues in this file.",
  },
  {
    label: "Summarize exports & responsibilities",
    prompt: "Summarize the main exports and responsibilities.",
  },
];

export function FileAiPanel({
  projectId,
  filePath,
}: {
  projectId: string;
  filePath: string | null;
}) {
  const [question, setQuestion] = useState("Explain this file.");
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function ask(nextQuestion: string) {
    if (!filePath || !nextQuestion.trim() || pending) return;
    setPending(true);
    setError(null);
    setAnswer(null);

    try {
      const response = await fetch("/api/explorer/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          filePath,
          question: nextQuestion.trim(),
        }),
      });

      const data = (await response.json()) as {
        answer?: string;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Request failed");
      }

      setAnswer(data.answer ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to ask AI");
    } finally {
      setPending(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await ask(question);
  }

  if (!filePath) {
    return (
      <div className="ca-panel p-4 text-sm text-(--ca-muted)">
        Select a file to ask the AI about it.
      </div>
    );
  }

  return (
    <div className="ca-panel min-w-0 space-y-3 p-4">
      <div className="min-w-0">
        <p className="text-sm font-semibold tracking-tight">AI Assistant</p>
        <p className="mt-0.5 truncate text-xs text-(--ca-muted)">
          Asking about{" "}
          <span className="font-mono font-medium text-(--ca-ink)">{filePath}</span>
        </p>
      </div>

      <div className="flex min-w-0 flex-col gap-2">
        {QUICK_PROMPTS.map((item) => (
          <Button
            key={item.prompt}
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            className="h-auto w-full justify-start whitespace-normal px-3 py-2 text-left text-xs leading-snug"
            onClick={() => {
              setQuestion(item.prompt);
              void ask(item.prompt);
            }}
          >
            {item.label}
          </Button>
        ))}
      </div>

      <form onSubmit={onSubmit} className="min-w-0 space-y-3">
        <Textarea
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          rows={3}
          disabled={pending}
          placeholder="Ask about this file..."
          maxLength={4000}
          className="min-w-0 resize-y"
        />
        <Button type="submit" disabled={pending || !question.trim()}>
          {pending ? "Thinking..." : "Ask AI"}
        </Button>
      </form>

      {error ? (
        <ActionAlert
          title="Couldn't get an answer"
          message={error}
          onDismiss={() => setError(null)}
        />
      ) : null}
      {answer ? (
        <div className="max-h-112 overflow-auto rounded-sm bg-(--ca-paper) p-3 text-sm whitespace-pre-wrap wrap-break-word">
          {answer}
        </div>
      ) : null}
    </div>
  );
}
