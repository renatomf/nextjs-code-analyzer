"use client";

import { useState } from "react";
import { MoreVertical } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { deleteProject } from "@/lib/actions/projects";

export function DeleteProjectButton({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`Delete ${projectName}`}
        onClick={() => setOpen(true)}
      >
        <MoreVertical />
      </Button>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        kicker="Project"
        titleDim="Delete"
        title={`${projectName}?`}
        description="The project, its files, health report, issues and chat context will be permanently deleted. This cannot be undone."
        confirmLabel="Delete project"
        pendingLabel="Deleting…"
        onConfirm={async () => {
          const result = await deleteProject(projectId).catch(() => ({
            error: "Could not delete the project. Try again.",
          }));
          if ("error" in result) {
            toast.error(result.error);
            return;
          }
          setOpen(false);
          toast.error(`Project “${projectName}” deleted.`);
        }}
      />
    </>
  );
}
