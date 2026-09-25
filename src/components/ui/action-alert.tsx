"use client";

import { cn } from "@/lib/utils";
import { AlertCircle, X } from "lucide-react";
import { useEffect, useId, useState } from "react";

export function ActionAlert({
  title = "Something went wrong",
  message,
  onDismiss,
  className,
}: {
  title?: string;
  message: string;
  onDismiss?: () => void;
  className?: string;
}) {
  const titleId = useId();

  return (
    <div
      role="alert"
      aria-labelledby={titleId}
      className={cn(
        "flex gap-3 rounded-none border border-destructive/30 border-l-2 border-l-destructive bg-destructive/6 px-4 py-3 text-destructive",
        className,
      )}
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p
          id={titleId}
          className="font-mono text-[0.7rem] tracking-[0.04em] uppercase"
        >
          {title}
        </p>
        <p className="mt-1 text-sm leading-relaxed text-(--ca-ink)">
          {message}
        </p>
      </div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss error"
          className="self-start p-1 text-(--ca-muted) transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--ca-ink)"
        >
          <X className="size-4" />
        </button>
      ) : null}
    </div>
  );
}

/** Fixed toast for short-lived action errors (e.g. list row buttons). */
export function ActionErrorToast({
  title,
  message,
  onDismiss,
}: {
  title?: string;
  message: string;
  onDismiss: () => void;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const show = window.requestAnimationFrame(() => setVisible(true));
    const timer = window.setTimeout(() => {
      setVisible(false);
      window.setTimeout(onDismiss, 200);
    }, 8000);
    return () => {
      window.cancelAnimationFrame(show);
      window.clearTimeout(timer);
    };
  }, [message, onDismiss]);

  return (
    <div
      className={cn(
        "pointer-events-auto fixed inset-x-4 bottom-5 z-50 mx-auto max-w-md transition-all duration-200 sm:inset-x-auto sm:right-5 sm:left-auto sm:w-[24rem]",
        visible ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
      )}
    >
      <ActionAlert
        title={title}
        message={message}
        onDismiss={() => {
          setVisible(false);
          window.setTimeout(onDismiss, 200);
        }}
        className="bg-(--ca-paper) shadow-lg dark:bg-(--ca-paper)"
      />
    </div>
  );
}
