import { desc, eq, sql } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";

import { codeChunks, projects, reports } from "@/db/schema";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { cn } from "@/lib/utils";

type ProjectStatus = (typeof projects.$inferSelect)["status"];

const STATUS_CLASS: Record<ProjectStatus, string> = {
  completed: "k-status-completed",
  failed: "k-status-failed",
  processing: "k-status-running",
  queued: "k-status-running",
};

function getUserProjects(userId: string) {
  // Only the columns the list renders, always scoped to the signed-in user.
  return db
    .select({
      id: projects.id,
      name: projects.name,
      source: projects.source,
      framework: projects.framework,
      status: projects.status,
      fileCount: projects.fileCount,
      healthScore: reports.healthScore,
      chunkCount: sql<number>`(select count(*) from ${codeChunks} where ${codeChunks.projectId} = ${projects.id})`.mapWith(Number),
    })
    .from(projects)
    .leftJoin(reports, eq(reports.projectId, projects.id))
    .where(eq(projects.userId, userId))
    .orderBy(desc(projects.createdAt));
}

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const userProjects = await getUserProjects(session.user.id);
  const firstName = session.user.name?.split(" ")[0] ?? "there";

  return (
    <main className="landing-shell k-guides min-h-svh">
      <div className="k-container py-[clamp(3rem,8vw,6rem)]">
        <header className="k-grid gap-y-8">
          <div className="md:col-span-3">
            <p className="k-kicker">Workspace</p>
            <h1 className="k-title mt-6 text-5xl sm:text-6xl">
              <span className="k-dim">Hello,</span> {firstName}
            </h1>
            <p className="k-lead mt-5 max-w-md">
              Your analyzed repositories and health scores live here.
            </p>
          </div>
          <div className="md:self-end">
            <Link href="/projects/new" className="k-bar k-bar-green">
              Analyze repository
            </Link>
          </div>
        </header>

        {userProjects.length === 0 ? (
          <section className="k-tile k-tile-light mt-14 flex min-h-0! flex-col items-start gap-4 p-8! md:mt-20">
            <span className="k-diamond text-(--k-green-deep)" aria-hidden />
            <h2 className="k-title text-3xl">
              <span className="k-dim">No projects</span> yet
            </h2>
            <p className="max-w-md text-sm leading-relaxed text-(--k-muted)">
              Connect a GitHub repository or upload a ZIP to run your first codebase
              health check.
            </p>
            <Link href="/projects/new" className="k-bar mt-2 w-full sm:w-72">
              Analyze new repository
            </Link>
          </section>
        ) : (
          <section className="mt-14 md:mt-20">
            <h2 className="k-mono mb-4 text-xs text-(--k-muted) uppercase">
              {String(userProjects.length).padStart(2, "0")} project
              {userProjects.length === 1 ? "" : "s"}
            </h2>

            <ul>
              {userProjects.map((project, index) => {
                const inFlight =
                  project.status === "processing" || project.status === "queued";
                const href = inFlight
                  ? `/projects/${project.id}/progress`
                  : `/projects/${project.id}`;

                return (
                  <li key={project.id} className="k-list-row">
                    <Link
                      href={href}
                      className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-4 py-5 sm:grid-cols-[3.5rem_1fr_7rem_8rem]"
                    >
                      <span className="k-mono text-xs text-(--k-soft)">
                        {String(index + 1).padStart(2, "0")}
                      </span>

                      <span className="min-w-0">
                        <span className="block truncate text-lg font-semibold tracking-tight">
                          {project.name}
                        </span>
                        <span className="k-mono mt-1 block truncate text-[0.7rem] text-(--k-muted)">
                          {project.framework ?? "Unknown framework"} ·{" "}
                          {project.fileCount} files
                          {project.chunkCount ? ` · ${project.chunkCount} chunks` : ""}
                          {project.source === "github" ? " · GitHub" : " · ZIP"}
                        </span>
                      </span>

                      <span className="hidden text-right sm:block">
                        {project.healthScore !== null ? (
                          <span className="k-title text-3xl tabular-nums">
                            {project.healthScore}
                            <span className="text-sm text-(--k-soft)"> /100</span>
                          </span>
                        ) : (
                          <span className="k-mono text-xs text-(--k-soft)">—</span>
                        )}
                      </span>

                      <span className="justify-self-end">
                        <span className={cn("k-status", STATUS_CLASS[project.status])}>
                          {project.status}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
