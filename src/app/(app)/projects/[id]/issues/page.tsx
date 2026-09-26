import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { IssuesDashboard } from "@/components/projects/issues-dashboard";
import {
  GenerateReportButton,
  RetryFullAnalysisButton,
} from "@/components/projects/report-actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { codeChunks, projects } from "@/db/schema";
import type { ReportIssue } from "@/lib/analysis/report-types";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function ProjectIssuesPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id } = await params;
  // A malformed id would make Postgres throw; treat it as not found.
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) notFound();

  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, parsedId.data), eq(projects.userId, session.user.id)),
    columns: { id: true, name: true },
    with: {
      report: {
        columns: {
          issues: true,
          healthScore: true,
        },
      },
    },
  });

  if (!project) notFound();

  const [chunk] = await db
    .select({ id: codeChunks.id })
    .from(codeChunks)
    .where(eq(codeChunks.projectId, project.id))
    .limit(1);

  const issues = (project.report?.issues ?? []) as ReportIssue[];

  return (
    <main className="landing-shell ca-guides flex-1">
      <div className="ca-container py-[clamp(3rem,8vw,6rem)]">
        <header className="mb-10 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="ca-kicker">Issues</p>
            <h1 className="ca-title mt-6 text-4xl wrap-break-word sm:text-5xl">
              {project.name}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href={`/projects/${project.id}/report`} />}
            >
              Health Report
            </Button>
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href={`/projects/${project.id}`} />}
            >
              Overview
            </Button>
          </div>
        </header>

        {!project.report ? (
          <Card>
            <CardHeader>
              <CardTitle>No issues yet</CardTitle>
              <CardDescription>
                Generate a health report first to populate the issues dashboard.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {chunk ? (
                <GenerateReportButton projectId={project.id} />
              ) : (
                <RetryFullAnalysisButton projectId={project.id} />
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Issues Dashboard</CardTitle>
              <CardDescription>
                Filter by severity and category. Health score:{" "}
                {project.report.healthScore}/100
              </CardDescription>
            </CardHeader>
            <CardContent>
              <IssuesDashboard projectId={project.id} issues={issues} />
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
