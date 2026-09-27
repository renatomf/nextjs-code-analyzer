import { and, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { IssuesDashboard } from "@/components/projects/issues-dashboard";
import {
  GenerateReportButton,
  RetryFullAnalysisButton,
} from "@/components/projects/report-actions";
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
    <main className="flex-1">
      <div className="ca-container py-10">
        {!project.report ? (
          <Card className="rounded-[0.375rem] ring-inset">
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
          <Card className="rounded-[0.375rem] ring-inset">
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
