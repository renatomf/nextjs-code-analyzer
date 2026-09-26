import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { ProjectChat } from "@/components/projects/project-chat";
import { Button } from "@/components/ui/button";
import { codeChunks, projects } from "@/db/schema";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function ProjectChatPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id } = await params;
  // A malformed id would make Postgres throw; treat it as not found.
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) notFound();

  const [project] = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(and(eq(projects.id, parsedId.data), eq(projects.userId, session.user.id)))
    .limit(1);

  if (!project) notFound();

  const [chunk] = await db
    .select({ id: codeChunks.id })
    .from(codeChunks)
    .where(eq(codeChunks.projectId, project.id))
    .limit(1);

  const ready = Boolean(chunk);

  return (
    <main className="landing-shell ca-guides min-h-svh">
      <div className="ca-container py-[clamp(3rem,8vw,6rem)]">
        <div className="mx-auto max-w-3xl">
          <header className="mb-10 flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="ca-kicker">AI Chat</p>
              <h1 className="ca-title mt-6 text-4xl wrap-break-word sm:text-5xl">
                {project.name}
              </h1>
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

          {ready ? (
            <ProjectChat projectId={project.id} projectName={project.name} />
          ) : (
            <section className="ca-panel flex flex-col items-start gap-4 p-8">
              <span className="ca-diamond text-(--ca-green-deep)" aria-hidden />
              <h2 className="ca-title text-3xl">
                <span className="ca-dim">Code knowledge</span> is not ready
              </h2>
              <p className="max-w-md text-sm leading-relaxed text-(--ca-muted)">
                This project has no indexed chunks yet. Finish import / knowledge
                building before chatting.
              </p>
              <Button
                variant="night"
                bar
                nativeButton={false}
                render={<Link href={`/projects/${project.id}`} />}
                className="mt-2 w-full sm:w-72"
              >
                Back to project
              </Button>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
