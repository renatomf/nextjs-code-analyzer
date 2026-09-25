import { isSourceFile } from "@/lib/files/filters";
import { readProjectFiles } from "@/lib/files/storage";

export type ProjectSourceFile = {
  relativePath: string;
  content: string;
};

/** Load extracted JS/TS source files for a project from `project_files`. */
export async function loadProjectSourceFiles(
  userId: string,
  projectId: string,
): Promise<ProjectSourceFile[]> {
  const stored = await readProjectFiles(userId, projectId);

  const files: ProjectSourceFile[] = [];

  for (const entry of stored) {
    if (!isSourceFile(entry.relativePath)) continue;
    files.push({ relativePath: entry.relativePath, content: entry.content });
  }

  return files;
}
