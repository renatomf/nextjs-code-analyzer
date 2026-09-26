import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { CodeExplorer } from "@/components/projects/code-explorer";
import { Button } from "@/components/ui/button";
import { projects } from "@/db/schema";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  buildFileTree,
  listProjectFilePaths,
  readProjectFile,
} from "@/lib/files/explorer";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ file?: string }>;
};

export default async function ProjectExplorerPage({
  params,
  searchParams,
}: PageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id } = await params;
  const query = await searchParams;

  // A malformed id would make Postgres throw; treat it as not found.
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) notFound();

  const [project] = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(and(eq(projects.id, parsedId.data), eq(projects.userId, session.user.id)))
    .limit(1);
  if (!project) notFound();

  let paths: string[] = [];
  try {
    paths = await listProjectFilePaths(session.user.id, project.id);
  } catch {
    paths = [];
  }

  const tree = buildFileTree(paths);
  // `?file=` comes from the URL: only a path from this project's list is used.
  const initialFile =
    query.file && paths.includes(query.file) ? query.file : (paths[0] ?? null);

  let initialContent: string | null = null;
  if (initialFile) {
    const file = await readProjectFile(session.user.id, project.id, initialFile);
    initialContent = file?.content ?? null;
  }

  return (
    <main className="landing-shell ca-guides flex-1">
      <div className="ca-container py-[clamp(3rem,8vw,6rem)]">
        <header className="mb-10 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="ca-kicker">Code Explorer</p>
            <h1 className="ca-title mt-6 text-4xl wrap-break-word sm:text-5xl">
              {project.name}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href={`/projects/${project.id}`} />}
            >
              Overview
            </Button>
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href={`/projects/${project.id}/chat`} />}
            >
              Chat
            </Button>
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href={`/projects/${project.id}/report`} />}
            >
              Report
            </Button>
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href={`/projects/${project.id}/issues`} />}
            >
              Issues
            </Button>
          </div>
        </header>

        {paths.length === 0 ? (
          <div className="ca-panel p-8 text-center text-sm text-(--ca-muted)">
            No extracted files are available for this project yet.
          </div>
        ) : (
          <CodeExplorer
            projectId={project.id}
            tree={tree}
            initialFile={initialFile}
            initialContent={initialContent}
          />
        )}
      </div>
    </main>
  );
}
