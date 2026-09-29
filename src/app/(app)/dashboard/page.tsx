import Link from "next/link";
import { redirect } from "next/navigation";

import { DeleteProjectButton } from "@/components/projects/delete-project-button";
import { ProjectStatusBadge } from "@/components/shared/project-status-badge";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth";
import { listUserProjects } from "@/modules/projects/server";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const userProjects = await listUserProjects(session.user.id);
  const firstName = session.user.name?.split(" ")[0] ?? "there";

  return (
    <main className="landing-shell ca-guides ca-guides-no-first flex flex-1 flex-col">
      <div className="ca-container pt-[clamp(3rem,8vw,6rem)]">
        <header className="ca-grid gap-y-8">
          <div className="md:col-span-3">
            <p className="ca-kicker">Workspace</p>
            <h1 className="ca-title mt-6 text-5xl sm:text-6xl">
              <span className="ca-dim">Hello,</span> {firstName}
            </h1>
            <p className="ca-lead mt-5 max-w-md">
              Your analyzed repositories and health scores live here.
            </p>
          </div>
          <div className="md:self-end md:pr-0!">
            <Button bar nativeButton={false} render={<Link href="/projects/new" />}>
              Analyze repository
            </Button>
          </div>
        </header>

        {userProjects.length === 0 ? (
          <section className="ca-panel mt-14 flex flex-col items-start gap-4 p-8 md:mt-20">
            <span className="ca-diamond text-(--ca-green-deep)" aria-hidden />
            <h2 className="ca-title text-3xl">
              <span className="ca-dim">No projects</span> yet
            </h2>
            <p className="max-w-md text-sm leading-relaxed text-(--ca-muted)">
              Connect a GitHub repository or upload a ZIP to run your first codebase
              health check.
            </p>
            <Button
              variant="night"
              bar
              nativeButton={false}
              render={<Link href="/projects/new" />}
              className="mt-2 w-full sm:w-72"
            >
              Analyze new repository
            </Button>
          </section>
        ) : (
          <section className="mt-14 md:mt-20">
            <h2 className="ca-mono mb-4 text-xs text-(--ca-muted) uppercase">
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
                  <li
                    key={project.id}
                    className="ca-list-row flex items-center pr-2 sm:pr-4"
                  >
                    <Link
                      href={href}
                      className="grid min-w-0 flex-1 grid-cols-[2.5rem_1fr_auto] items-center gap-4 px-4 py-5 sm:grid-cols-[3.5rem_1fr_7rem_8rem] sm:px-6"
                    >
                      <span className="ca-mono text-xs text-(--ca-soft)">
                        {String(index + 1).padStart(2, "0")}
                      </span>

                      <span className="min-w-0">
                        <span className="block truncate text-lg font-semibold tracking-tight">
                          {project.name}
                        </span>
                        <span className="ca-mono mt-1 block truncate text-[0.7rem] text-(--ca-muted)">
                          {project.framework ?? "Unknown framework"} ·{" "}
                          {project.fileCount} files
                          {project.chunkCount ? ` · ${project.chunkCount} chunks` : ""}
                          {project.source === "github" ? " · GitHub" : " · ZIP"}
                        </span>
                      </span>

                      <span className="hidden text-right sm:block">
                        {project.healthScore !== null ? (
                          <span className="ca-title text-3xl tabular-nums">
                            {project.healthScore}
                            <span className="text-sm text-(--ca-soft)"> /100</span>
                          </span>
                        ) : (
                          <span className="ca-mono text-xs text-(--ca-soft)">—</span>
                        )}
                      </span>

                      <span className="justify-self-end">
                        <ProjectStatusBadge status={project.status} />
                      </span>
                    </Link>
                    <DeleteProjectButton
                      projectId={project.id}
                      projectName={project.name}
                    />
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
      {/* The 25% guide line starts right after the list and runs to the bottom. */}
      <div
        aria-hidden
        className="ca-guides ca-guides-first-only min-h-[clamp(3rem,8vw,6rem)] flex-1"
      />
    </main>
  );
}
