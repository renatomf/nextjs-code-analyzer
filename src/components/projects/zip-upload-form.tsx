"use client";

import { LimitReachedNotice } from "@/components/billing/limit-reached-notice";
import { ReanalyzeDialog } from "@/components/projects/reanalyze-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createProjectFromZip,
  type ProjectActionState,
} from "@/lib/actions/github";
import { MAX_UPLOAD_BYTES, UPLOAD_TOO_BIG_MESSAGE } from "@/lib/limits";
import { startTransition, useActionState, useRef, useState, type FormEvent } from "react";

const initialState: ProjectActionState = {};

export function ZipUploadForm() {
  // React resets the form after its action runs, emptying the file input:
  // "Analyze again" re-sends the last submission instead of the form.
  const lastSubmission = useRef<FormData | null>(null);
  const [state, formAction, pending] = useActionState(
    (previous: ProjectActionState, formData: FormData) => {
      lastSubmission.current = formData;
      return createProjectFromZip(previous, formData);
    },
    initialState,
  );

  // A ZIP over the limit never reaches the server on Vercel (TD-45): stop it
  // here so the user gets a reason, not the platform's 413. The server
  // checks the same limit.
  const [tooBig, setTooBig] = useState(false);
  function checkSize(event: FormEvent<HTMLFormElement>) {
    const input = event.currentTarget.elements.namedItem("file");
    const file = input instanceof HTMLInputElement ? input.files?.[0] : undefined;
    const over = Boolean(file && file.size > MAX_UPLOAD_BYTES);
    setTooBig(over);
    if (over) event.preventDefault();
  }

  function analyzeAgain() {
    const last = lastSubmission.current;
    if (!last) return;
    const again = new FormData();
    for (const [key, value] of last) again.append(key, value);
    again.set("confirmReanalyze", "1");
    startTransition(() => formAction(again));
  }

  return (
    <form action={formAction} onSubmit={checkSize} className="space-y-4">
      <ReanalyzeDialog state={state} resubmit={analyzeAgain} />
      <div className="space-y-2">
        <Label htmlFor="file">ZIP file</Label>
        <Input
          id="file"
          name="file"
          type="file"
          accept=".zip,application/zip"
          required
          onChange={() => setTooBig(false)}
        />
        <p className="text-xs text-(--ca-muted)">
          Max 4 MB. For a bigger project, import it from GitHub. Only
          JavaScript/TypeScript source files are analyzed.
        </p>
      </div>
      {tooBig || state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {tooBig ? UPLOAD_TOO_BIG_MESSAGE : state.error}
        </p>
      ) : null}
      {state.limit ? <LimitReachedNotice limit={state.limit} /> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Uploading..." : "Upload and analyze"}
      </Button>
    </form>
  );
}
