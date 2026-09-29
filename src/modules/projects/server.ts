import "server-only";

/**
 * Public API of the projects module — server part (ADR-001). Every write to a
 * project's status goes through here. Every `userId` must come from the
 * server session, never from the client.
 */

export {
  cancelActiveAnalysis,
  claimAnalysis,
  deleteProject,
  findAnalysisCandidate,
  readProgress,
  requeueIdleProject,
  setProjectProgress,
  setProjectStatus,
  startReanalysis,
} from "./infrastructure/drizzle-project-lifecycle";
export { importArchive } from "./infrastructure/import-archive";
export {
  findExistingImport,
  getProjectIssues,
  getProjectProgress,
  getProjectReport,
  getProjectSummary,
  listUserProjects,
} from "./infrastructure/drizzle-project-queries";
