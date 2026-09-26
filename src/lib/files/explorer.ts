import {
  readProjectFile as readStoredProjectFile,
  readProjectManifest,
} from "@/lib/files/storage";

export type FileTreeNode = {
  name: string;
  path: string;
  type: "file" | "dir";
  children?: FileTreeNode[];
};

export type ProjectFileContent = {
  relativePath: string;
  content: string;
  sizeBytes: number;
};

/** Build a nested file tree from flat relative paths. */
export function buildFileTree(paths: string[]): FileTreeNode[] {
  const root: FileTreeNode[] = [];

  for (const relativePath of [...paths].sort()) {
    const parts = relativePath.split("/").filter(Boolean);
    let current = root;

    parts.forEach((part, index) => {
      const isFile = index === parts.length - 1;
      const nodePath = parts.slice(0, index + 1).join("/");
      let existing = current.find((node) => node.name === part);

      if (!existing) {
        existing = {
          name: part,
          path: nodePath,
          type: isFile ? "file" : "dir",
          children: isFile ? undefined : [],
        };
        current.push(existing);
      }

      if (!isFile) {
        existing.children ??= [];
        current = existing.children;
      }
    });
  }

  function sortNodes(nodes: FileTreeNode[]) {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const node of nodes) {
      if (node.children) sortNodes(node.children);
    }
  }

  sortNodes(root);
  return root;
}

// Files live in `project_files` (Postgres), not on disk. `userId` must come
// from the server session; storage scopes every query by it.

export async function listProjectFilePaths(
  userId: string,
  projectId: string,
): Promise<string[]> {
  const manifest = await readProjectManifest(userId, projectId);
  return manifest.map((entry) => entry.relativePath).sort();
}

/** `relativePath` may come from the client; storage validates it. */
export async function readProjectFile(
  userId: string,
  projectId: string,
  relativePath: string,
): Promise<ProjectFileContent | null> {
  const file = await readStoredProjectFile(userId, projectId, relativePath);
  if (!file) return null;

  return {
    relativePath: file.relativePath,
    content: file.content,
    sizeBytes: file.sizeBytes,
  };
}