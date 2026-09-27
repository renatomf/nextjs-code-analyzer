import { and, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { AnalysisProgress } from "@/components/projects/analysis-progress";
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
    <main className="flex-1">
      <div className="ca-container py-10">
        <div>
          <p className="ca-lead mb-6 max-w-md">
            Sit tight — we are reading, chunking, and reviewing your code.
          </p>

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
