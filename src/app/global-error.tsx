"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

// Errors in the root layout end here instead of in the default boundary,
// which would hide them from Sentry. Renders its own document: no global
// styles, so it stays plain.
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "4rem 1rem", textAlign: "center" }}>
        <title>Something went wrong · codedriven</title>
        <h1>Something went wrong</h1>
        <p>The error was reported. Please try again.</p>
        <button type="button" onClick={() => retry()}>
          Try again
        </button>
      </body>
    </html>
  );
}
