import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import {
  GenerateReportButton,
  RetryFullAnalysisButton,
} from "@/components/projects/report-actions";
import { RetryKnowledgeButton } from "@/components/projects/retry-knowledge-button";
import { ActionAlert } from "@/components/shared/action-alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { auth } from "@/lib/auth";
import { getProjectSummary } from "@/lib/projects";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function ProjectOverviewPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id } = await params;
  // A malformed id would make Postgres throw; treat it as not found.
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) notFound();

  // Same cached query as the layout: no second round-trip for this page.
  const project = await getProjectSummary(session.user.id, parsedId.data);
  if (!project) notFound();

  const chatReady = project.chunkCount > 0;
  const reportReady = project.healthScore !== null;

  return (
    <main className="flex-1">
      <div className="ca-container py-10">
        <div>
          <Card className="rounded-[0.375rem] ring-inset">
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
                // errorMessage also holds import notes (e.g. skipped large
                // files) on projects that did not fail.
                <ActionAlert
                  title={
                    project.status === "failed" ? "Analysis failed" : "Import note"
                  }
                  message={project.errorMessage}
                />
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
