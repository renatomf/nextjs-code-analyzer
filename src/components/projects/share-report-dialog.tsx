"use client";

import { Copy, Link2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { ActionAlert } from "@/components/shared/action-alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createReportShareAction,
  revokeReportShareAction,
} from "@/lib/actions/report-share";
import { DEFAULT_SHARE_EXPIRY, type ShareExpiry } from "@/modules/projects";

const EXPIRY_ITEMS: Record<ShareExpiry, string> = {
  "7d": "7 days",
  "30d": "30 days",
  never: "No expiry (until revoked)",
};

function expiryText(expiresAt: string | null) {
  return expiresAt
    ? `expires on ${new Date(expiresAt).toLocaleDateString()}`
    : "never expires";
}

/**
 * Public read-only link to this report. The link is shown only right after
 * it is created (the server keeps just a hash of its token).
 */
export function ShareReportDialog({
  projectId,
  share,
}: {
  projectId: string;
  /** The active link, if any (never its token). */
  share: { expiresAt: string | null } | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [expiry, setExpiry] = useState<ShareExpiry>(DEFAULT_SHARE_EXPIRY);
  const [created, setCreated] = useState<{ url: string; expiresAt: string | null } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function create() {
    setError(null);
    startTransition(async () => {
      const result = await createReportShareAction({ projectId, expiry });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setCreated({ url: `${window.location.origin}${result.path}`, expiresAt: result.expiresAt });
      router.refresh();
    });
  }

  function revoke() {
    setError(null);
    startTransition(async () => {
      const result = await revokeReportShareAction({ projectId });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setCreated(null);
      toast.success("Link revoked. It no longer works.");
      router.refresh();
    });
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied.");
    } catch {
      toast.error("Could not copy. Select the link and copy it.");
    }
  }

  return (
    <>
      <Button type="button" variant="outline" mint onClick={() => setOpen(true)}>
        <Link2 aria-hidden />
        Share report
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (pending) return;
          setOpen(next);
          // The link is shown once: closing the dialog forgets it.
          if (!next) {
            setCreated(null);
            setError(null);
          }
        }}
      >
        <DialogContent showCloseButton={!pending}>
          <DialogHeader className="gap-3">
            <p className="ca-kicker">Public link</p>
            <DialogTitle>
              <span className="text-(--ca-muted)">Share</span> this report
            </DialogTitle>
            <DialogDescription>
              Anyone with the link can read the health report: scores,
              summaries and issues, with secrets redacted. Never your code,
              files or chat. Creating a new link turns off the previous one.
            </DialogDescription>
          </DialogHeader>

          {error ? <ActionAlert title="Couldn't update the link" message={error} /> : null}

          {created ? (
            <div className="space-y-2">
              <Label htmlFor="share-url">Your link ({expiryText(created.expiresAt)})</Label>
              <div className="flex gap-2">
                <Input id="share-url" value={created.url} readOnly onFocus={(e) => e.target.select()} />
                <Button type="button" onClick={() => copy(created.url)} aria-label="Copy link">
                  <Copy aria-hidden />
                </Button>
              </div>
              <p className="text-xs text-(--ca-muted)">
                Copy it now: for security it is shown only once.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {share ? (
                <p className="text-sm text-(--ca-muted)">
                  A link is active and {expiryText(share.expiresAt)}.
                </p>
              ) : null}
              <Label htmlFor="share-expiry">Link expires after</Label>
              <Select
                items={EXPIRY_ITEMS}
                value={expiry}
                onValueChange={(value) => setExpiry(value as ShareExpiry)}
              >
                <SelectTrigger id="share-expiry" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(EXPIRY_ITEMS) as ShareExpiry[]).map((value) => (
                    <SelectItem key={value} value={value}>
                      {EXPIRY_ITEMS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            {share || created ? (
              <Button type="button" variant="destructive" disabled={pending} onClick={revoke}>
                {pending ? "Working..." : "Revoke link"}
              </Button>
            ) : (
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
            )}
            {created ? (
              <Button type="button" onClick={() => setOpen(false)}>
                Done
              </Button>
            ) : (
              <Button type="button" disabled={pending} onClick={create}>
                {pending ? "Working..." : share ? "Create a new link" : "Create link"}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
