import type { projects } from "@/db/schema";
import { cn } from "@/lib/utils";

type ProjectStatus = (typeof projects.$inferSelect)["status"];

const STATUS_CLASS: Record<ProjectStatus, string> = {
  completed: "ca-status-completed",
  failed: "ca-status-failed",
  processing: "ca-status-running",
  queued: "ca-status-running",
};

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return <span className={cn("ca-status", STATUS_CLASS[status])}>{status}</span>;
}
