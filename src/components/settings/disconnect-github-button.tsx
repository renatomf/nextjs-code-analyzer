"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { disconnectGitHub } from "@/lib/actions/github";

export function DisconnectGitHubButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        mint
        onClick={() => setOpen(true)}
      >
        Disconnect GitHub
      </Button>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        kicker="GitHub"
        titleDim="Disconnect"
        title="GitHub?"
        description="You will not be able to import private repositories until you connect GitHub again. Existing projects are kept."
        confirmLabel="Disconnect"
        pendingLabel="Disconnecting…"
        onConfirm={async () => {
          try {
            await disconnectGitHub();
            setOpen(false);
            toast.error("GitHub disconnected.");
          } catch {
            toast.error("Could not disconnect GitHub. Try again.");
          }
        }}
      />
    </>
  );
}
