import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { AnalysisProgress } from "@/components/projects/analysis-progress";
import { auth } from "@/lib/auth";
import { getProjectProgress } from "@/modules/projects/server";

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

  const project = await getProjectProgress(session.user.id, parsedId.data);

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
