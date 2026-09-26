import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { AnalysisProgress } from "@/components/projects/analysis-progress";
import { Button } from "@/components/ui/button";
import { projects } from "@/db/schema";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function ProjectProgressPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id } = await params;
  // A malformed id would make Postgres throw; treat it as not found.
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) notFound();

  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, parsedId.data), eq(projects.userId, session.user.id)),
    columns: {
      id: true,
      name: true,
      status: true,
      progressStep: true,
      progressPercent: true,
      errorMessage: true,
      framework: true,
      fileCount: true,
    },
    with: { report: { columns: { healthScore: true } } },
  });

  if (!project) notFound();

  return (
    <main className="landing-shell ca-guides flex-1">
      <div className="ca-container py-[clamp(3rem,8vw,6rem)]">
        <div className="mx-auto max-w-3xl">
          <header className="mb-10 flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="ca-kicker">Analysis</p>
              <h1 className="ca-title mt-6 text-4xl wrap-break-word sm:text-5xl">
                {project.name}
              </h1>
              <p className="ca-lead mt-4 max-w-md">
                Sit tight — we are reading, chunking, and reviewing your code.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href={`/projects/${project.id}`} />}
            >
              Overview
            </Button>
          </header>

          <AnalysisProgress
            projectId={project.id}
            initial={{
              id: project.id,
              name: project.name,
              status: project.status,
              progressStep: project.progressStep,
              progressPercent: project.progressPercent,
              errorMessage: project.errorMessage,
              framework: project.framework,
              fileCount: project.fileCount,
              report: project.report,
            }}
          />
        </div>
      </div>
    </main>
  );
}
