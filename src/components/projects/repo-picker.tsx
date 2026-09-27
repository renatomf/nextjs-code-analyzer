"use client";

import { LimitReachedNotice } from "@/components/billing/limit-reached-notice";
import { ReanalyzeDialog } from "@/components/projects/reanalyze-dialog";
import { Button } from "@/components/ui/button";
import {
  createProjectFromGitHub,
  type ProjectActionState,
} from "@/lib/actions/github";
import type { GitHubRepo } from "@/lib/github";
import { useActionState, useRef } from "react";
import { useFormStatus } from "react-dom";

const initialState: ProjectActionState = {};

function AnalyzeButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending} className="min-w-28">
      {pending ? "Importing..." : "Analyze"}
    </Button>
  );
}

export function RepoPicker({ repos }: { repos: GitHubRepo[] }) {
  const [state, formAction] = useActionState(
    createProjectFromGitHub,
    initialState,
  );
  // The row form that was submitted last, to re-submit it after confirming.
  const lastFormRef = useRef<HTMLFormElement>(null);

  if (repos.length === 0) {
    return (
      <p className="text-sm text-(--ca-muted)">
        No repositories found for this GitHub account.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <ReanalyzeDialog state={state} formRef={lastFormRef} />
      {state.limit ? <LimitReachedNotice limit={state.limit} /> : null}
      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <ul className="border-t border-(--ca-line)">
        {repos.map((repo) => (
          <li
            key={repo.id}
            className="flex flex-col gap-3 border-b border-(--ca-line) py-4 transition-colors hover:bg-(--ca-card) sm:flex-row sm:items-center sm:justify-between sm:px-3"
          >
            <div className="min-w-0">
              <p className="truncate font-medium tracking-tight">
                {repo.full_name}
              </p>
              <p className="mt-1 font-mono text-[0.7rem] tracking-[0.04em] text-(--ca-muted) uppercase">
                {repo.private ? "Private" : "Public"} · default branch{" "}
                {repo.default_branch}
              </p>
            </div>
            <form
              action={formAction}
              onSubmit={(event) => {
                lastFormRef.current = event.currentTarget;
              }}
            >
              <input type="hidden" name="fullName" value={repo.full_name} />
              <input
                type="hidden"
                name="defaultBranch"
                value={repo.default_branch}
              />
              <AnalyzeButton />
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
