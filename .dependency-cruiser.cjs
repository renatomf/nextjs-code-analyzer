/**
 * Architecture rules from ADR-001 (docs/decisions/001-modular-monolith.md),
 * checked in CI by `npm run lint:arch`.
 *
 * Existing violations are recorded in .dependency-cruiser-known-violations.json
 * and tolerated; any NEW violation fails the build. As modules are migrated,
 * regenerate the baseline (`npm run lint:arch:baseline`) so it only shrinks.
 */

/** Frameworks and infrastructure libraries the domain must not know. */
const INFRA_PACKAGES =
  "^node_modules/(next|react|react-dom|drizzle-orm|pg|stripe|ai|@ai-sdk|@huggingface|onnxruntime-node|next-auth|@auth)/";

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "domain-is-pure",
      severity: "error",
      comment:
        "Domain is plain TypeScript: no application/infrastructure layers, no legacy src/lib or src/db, no frameworks.",
      from: { path: "^src/modules/[^/]+/domain/" },
      to: {
        path: [
          "^src/modules/[^/]+/(application|infrastructure)/",
          "^src/(lib|db|app|components)/",
          INFRA_PACKAGES,
        ],
      },
    },
    {
      name: "application-depends-on-ports",
      severity: "error",
      comment:
        "Use cases depend on the domain and on their own ports, never on infrastructure implementations.",
      from: { path: "^src/modules/[^/]+/application/" },
      to: {
        path: [
          "^src/modules/[^/]+/infrastructure/",
          "^src/(db|app|components)/",
          "^node_modules/(next|drizzle-orm|pg|stripe|@ai-sdk|@huggingface|onnxruntime-node)/",
        ],
      },
    },
    {
      name: "module-public-api-only",
      severity: "error",
      comment: "A module only imports another module through its index.ts.",
      from: { path: "^src/modules/([^/]+)/" },
      to: {
        path: "^src/modules/[^/]+/",
        pathNot: ["^src/modules/$1/", "^src/modules/[^/]+/index\\.ts$"],
      },
    },
    {
      name: "no-react-in-modules",
      severity: "error",
      comment: "UI lives in src/app and src/components, never inside modules.",
      from: { path: "^src/modules/" },
      to: { path: "^node_modules/(react|react-dom)/" },
    },
    {
      name: "delivery-does-not-touch-the-database",
      severity: "error",
      comment:
        "Pages, route handlers and components call module use cases/queries, never the database client or schema (type-only imports are fine).",
      from: { path: "^src/(app|components)/" },
      to: { path: "^src/(db/|lib/db\\.ts$)", dependencyTypesNot: ["type-only"] },
    },
    {
      name: "no-circular",
      severity: "error",
      comment: "Cycles make modules impossible to reason about (and to extract).",
      from: {},
      to: { circular: true },
    },
    {
      name: "production-does-not-import-tests",
      severity: "error",
      from: { path: "^src/", pathNot: ["\\.test\\.ts$", "^src/test/"] },
      to: { path: ["\\.test\\.ts$", "^src/test/"] },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: { path: "(^|/)\\.next/" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
      mainFields: ["module", "main", "types", "typings"],
    },
  },
};
