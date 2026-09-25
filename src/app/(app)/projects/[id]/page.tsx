import { and, eq, sql } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import {
  GenerateReportButton,
  RetryFullAnalysisButton,
} from "@/components/projects/report-actions";
import { RetryKnowledgeButton } from "@/components/projects/retry-knowledge-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { codeChunks, projects, reports } from "@/db/schema";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { cn } from "@/lib/utils";

type PageProps = {
  params: Promise<{ id: string }>;
};

type ProjectStatus = (typeof projects.$inferSelect)["status"];

const STATUS_CLASS: Record<ProjectStatus, string> = {
  completed: "ca-status-completed",
  failed: "ca-status-failed",
  processing: "ca-status-running",
  queued: "ca-status-running",
};

export default async function ProjectOverviewPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id } = await params;
  // A malformed id would make Postgres throw; treat it as not found.
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) notFound();

  const [project] = await db
    .select({
      id: projects.id,
      name: projects.name,
      source: projects.source,
      framework: projects.framework,
      status: projects.status,
      fileCount: projects.fileCount,
      repositoryUrl: projects.repositoryUrl,
      errorMessage: projects.errorMessage,
      healthScore: reports.healthScore,
      chunkCount: sql<number>`(select count(*) from ${codeChunks} where ${codeChunks.projectId} = ${projects.id})`.mapWith(Number),
    })
    .from(projects)
    .leftJoin(reports, eq(reports.projectId, projects.id))
    .where(and(eq(projects.id, parsedId.data), eq(projects.userId, session.user.id)))
    .limit(1);

  if (!project) notFound();

  const chatReady = project.chunkCount > 0;
  const reportReady = project.healthScore !== null;

  const navLinks = [
    reportReady
      ? {
          href: `/projects/${project.id}/report`,
          label: "Health Report",
          primary: true,
        }
      : null,
    reportReady
      ? { href: `/projects/${project.id}/issues`, label: "Issues" }
      : null,
    chatReady
      ? { href: `/projects/${project.id}/chat`, label: "AI Chat" }
      : null,
    { href: `/projects/${project.id}/explorer`, label: "Explorer" },
  ].filter(Boolean) as Array<{
    href: string;
    label: string;
    primary?: boolean;
  }>;

  return (
    <main className="landing-shell ca-guides min-h-svh">
      <div className="ca-container py-[clamp(3rem,8vw,6rem)]">
        <div className="mx-auto max-w-3xl">
          <header className="mb-10">
            <p className="ca-kicker">Project</p>
            <h1 className="ca-title mt-6 text-4xl wrap-break-word sm:text-5xl">
              {project.name}
            </h1>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span className={cn("ca-status", STATUS_CLASS[project.status])}>
                {project.status}
              </span>
              {project.status === "processing" ||
              project.status === "queued" ? (
                <Link
                  href={`/projects/${project.id}/progress`}
                  className="text-xs font-medium text-(--ca-ink) underline-offset-4 hover:underline"
                >
                  View progress
                </Link>
              ) : null}
            </div>
            <nav className="mt-6 flex flex-wrap gap-2">
              {navLinks.map((link) => (
                <Button
                  key={link.href}
                  variant={link.primary ? "default" : "outline"}
                  size="sm"
                  nativeButton={false}
                  render={<Link href={link.href} />}
                >
                  {link.label}
                </Button>
              ))}
            </nav>
          </header>

          <Card>
            <CardHeader>
              <CardTitle>Overview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <dl className="grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className="text-(--ca-muted)">Source</dt>
                  <dd className="mt-0.5 font-medium capitalize">{project.source}</dd>
                </div>
                <div>
                  <dt className="text-(--ca-muted)">Framework</dt>
                  <dd className="mt-0.5 font-medium">{project.framework ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-(--ca-muted)">Source files</dt>
                  <dd className="mt-0.5 font-medium tabular-nums">
                    {project.fileCount}
                  </dd>
                </div>
                <div>
                  <dt className="text-(--ca-muted)">Code chunks</dt>
                  <dd className="mt-0.5 font-medium tabular-nums">
                    {project.chunkCount}
                  </dd>
                </div>
                <div>
                  <dt className="text-(--ca-muted)">Health score</dt>
                  <dd className="mt-0.5 font-semibold tabular-nums">
                    {reportReady ? `${project.healthScore}/100` : "—"}
                  </dd>
                </div>
                {project.repositoryUrl ? (
                  <div className="sm:col-span-2">
                    <dt className="text-(--ca-muted)">Repository</dt>
                    <dd className="mt-0.5">
                      <a
                        href={project.repositoryUrl}
                        className="font-medium break-all text-(--ca-ink) underline-offset-4 hover:underline"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {project.repositoryUrl}
                      </a>
                    </dd>
                  </div>
                ) : null}
              </dl>

              {project.errorMessage ? (
                <p className="border border-destructive/30 border-l-2 border-l-destructive bg-destructive/5 px-3 py-2 text-destructive">
                  {project.errorMessage}
                </p>
              ) : null}

              {reportReady ? (
                <div className="space-y-3 border-t border-(--ca-line) pt-4">
                  <p className="text-(--ca-muted)">
                    Health report is ready. Open it for category scores, issues, and
                    the improvement roadmap.
                  </p>
                  <RetryFullAnalysisButton projectId={project.id} />
                </div>
              ) : chatReady ? (
                <div className="space-y-3 border-t border-(--ca-line) pt-4">
                  <p className="text-(--ca-muted)">
                    Code knowledge is ready. Generate the health report next.
                  </p>
                  <GenerateReportButton projectId={project.id} />
                  <RetryFullAnalysisButton projectId={project.id} />
                </div>
              ) : null}

              {project.status === "failed" ? (
                <div className="space-y-3 border-t border-(--ca-line) pt-4">
                  <RetryFullAnalysisButton projectId={project.id} />
                  <RetryKnowledgeButton projectId={project.id} />
                  <Button
                    variant="outline"
                    nativeButton={false}
                    render={<Link href="/projects/new" />}
                  >
                    Try another project
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
