"use client";

import { useState, type RefObject } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import type { ProjectActionState } from "@/lib/actions/github";

/**
 * Shown when the server refused an import because the project was already
 * analyzed. Confirming re-submits with `confirmReanalyze=1`: through
 * `resubmit` when the form cannot be sent again as it is (React resets a
 * form after its action, which empties a file input), otherwise by
 * re-submitting the form in `formRef`.
 */
export function ReanalyzeDialog({
  state,
  formRef,
  resubmit,
}: {
  state: ProjectActionState;
  formRef?: RefObject<HTMLFormElement | null>;
  resubmit?: () => void;
}) {
  // Each submit returns a new state object, so a dismissed prompt stays closed
  // until the server reports a duplicate again.
  const [dismissed, setDismissed] = useState<ProjectActionState | null>(null);
  const open = Boolean(state.duplicate) && dismissed !== state;

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setDismissed(state);
      }}
      kicker="Already analyzed"
      titleDim="Analyze"
      title="it again?"
      description={`“${state.duplicate?.name ?? "This project"}” was already imported. Analyzing it again creates a new project with the latest code and counts toward your daily analyses. The previous analysis is kept.`}
      confirmLabel="Analyze again"
      pendingLabel="Starting…"
      onConfirm={async () => {
        setDismissed(state);
        if (resubmit) {
          resubmit();
          return;
        }
        const form = formRef?.current;
        if (!form) return;

        const confirm = document.createElement("input");
        confirm.type = "hidden";
        confirm.name = "confirmReanalyze";
        confirm.value = "1";
        form.appendChild(confirm);
        form.requestSubmit();
        confirm.remove();
      }}
    />
  );
}
