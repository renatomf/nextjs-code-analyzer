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
import { useActionState, useRef } from "react";

const initialState: ProjectActionState = {};

export function ZipUploadForm() {
  const [state, formAction, pending] = useActionState(
    createProjectFromZip,
    initialState,
  );
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <ReanalyzeDialog state={state} formRef={formRef} />
      <div className="space-y-2">
        <Label htmlFor="file">ZIP file</Label>
        <Input
          id="file"
          name="file"
          type="file"
          accept=".zip,application/zip"
          required
        />
        <p className="text-xs text-(--ca-muted)">
          Max 100 MB. Only JavaScript/TypeScript source files are analyzed.
        </p>
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      {state.limit ? <LimitReachedNotice limit={state.limit} /> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Uploading..." : "Upload and analyze"}
      </Button>
    </form>
  );
}
