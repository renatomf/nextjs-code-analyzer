"use client";

import { useState, useTransition } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { signOutAction } from "@/lib/actions/auth";

export function SignOutButton() {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirmSignOut() {
    startTransition(async () => {
      await signOutAction();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-sm px-2.5 py-1.5 text-[0.8125rem] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
      >
        Sign out
      </button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!pending) setOpen(next);
        }}
      >
        {/* The dialog renders in a portal outside the page shell, so it
            carries `landing-shell` itself to get the k-* tokens. */}
        <DialogContent
          showCloseButton={!pending}
          className="landing-shell gap-6 rounded-md p-6 ring-(--k-line) sm:max-w-md"
        >
          <DialogHeader className="gap-3">
            <p className="k-kicker">Session</p>
            <DialogTitle className="k-title text-3xl">
              <span className="k-dim">Sign</span> out?
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed text-(--k-muted)">
              You will need to sign in again to access your projects and analyses.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => setOpen(false)}
              className="k-bar k-bar-light"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={confirmSignOut}
              className="k-bar"
            >
              {pending ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
