import { relations } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

// Enums

export const planEnum = pgEnum("plan", ["free", "premium"]);

export const planStatusEnum = pgEnum("plan_status", [
  "none",
  "active",
  "past_due",
  "canceled",
]);

export const projectSourceEnum = pgEnum("project_source", ["github", "upload"]);

export const projectStatusEnum = pgEnum("project_status", [
  "queued",
  "processing",
  "completed",
  "failed",
]);

// Helpers

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).defaultNow().notNull();

const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date());

// Tables

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("email_verified", { withTimezone: true }),
  image: text("image"),
  passwordHash: text("password_hash"),

  authProvider: text("auth_provider"), // google | email | github
  githubAccessToken: text("github_access_token"),
  githubUsername: text("github_username"),

  stripeCustomerId: text("stripe_customer_id").unique(),
  stripeSubscriptionId: text("stripe_subscription_id").unique(),
  stripePriceId: text("stripe_price_id"),
  plan: planEnum("plan").default("free").notNull(),
  planStatus: planStatusEnum("plan_status").default("none").notNull(),

  createdAt: createdAt(),
  updatedAt: updatedAt(),
}).enableRLS();

export const usageEvents = pgTable(
  "usage_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // analysis
    createdAt: createdAt(),
  },
  (t) => [index("usage_events_user_id_type_created_at_idx").on(t.userId, t.type, t.createdAt)],
).enableRLS();

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [unique("accounts_provider_provider_account_id_key").on(t.provider, t.providerAccountId)],
).enableRLS();

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionToken: text("session_token").notNull().unique(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
}).enableRLS();

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull().unique(),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
  },
  (t) => [unique("verification_tokens_identifier_token_key").on(t.identifier, t.token)],
).enableRLS();

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    source: projectSourceEnum("source").notNull(),
    repositoryUrl: text("repository_url"),
    framework: text("framework"),
    status: projectStatusEnum("status").default("queued").notNull(),
    errorMessage: text("error_message"),
    fileCount: integer("file_count").default(0).notNull(),
    progressStep: text("progress_step"),
    progressPercent: integer("progress_percent").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("projects_user_id_idx").on(t.userId)],
).enableRLS();

// Extracted files of a project (replaces the tutorial's local .data/ folder,
// which does not survive or get shared across serverless instances).
export const projectFiles = pgTable(
  "project_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    relativePath: text("relative_path").notNull(),
    content: text("content").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("project_files_project_id_relative_path_key").on(t.projectId, t.relativePath),
  ],
).enableRLS();

export const codeChunks = pgTable(
  "code_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    filePath: text("file_path").notNull(),
    content: text("content").notNull(),
    startLine: integer("start_line"),
    endLine: integer("end_line"),
    embedding: vector("embedding", { dimensions: 384 }).notNull(),
  },
  (t) => [index("code_chunks_project_id_idx").on(t.projectId)],
).enableRLS();

export type CategoryScores = {
  architecture: number;
  security: number;
  performance: number;
  codeQuality: number;
  maintainability: number;
  documentation: number;
};

export type ReportIssue = {
  title: string;
  description: string;
};

export const reports = pgTable("reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .unique()
    .references(() => projects.id, { onDelete: "cascade" }),
  healthScore: integer("health_score").notNull(),
  categoryScores: jsonb("category_scores").$type<CategoryScores>().notNull(),
  issues: jsonb("issues").$type<ReportIssue[]>().notNull(),
  createdAt: createdAt(),
}).enableRLS();

// Relations

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  sessions: many(sessions),
  projects: many(projects),
  usageEvents: many(usageEvents),
}));

export const usageEventsRelations = relations(usageEvents, ({ one }) => ({
  user: one(users, { fields: [usageEvents.userId], references: [users.id] }),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  user: one(users, { fields: [projects.userId], references: [users.id] }),
  files: many(projectFiles),
  chunks: many(codeChunks),
  report: one(reports),
}));

export const projectFilesRelations = relations(projectFiles, ({ one }) => ({
  project: one(projects, { fields: [projectFiles.projectId], references: [projects.id] }),
}));

export const codeChunksRelations = relations(codeChunks, ({ one }) => ({
  project: one(projects, { fields: [codeChunks.projectId], references: [projects.id] }),
}));

export const reportsRelations = relations(reports, ({ one }) => ({
  project: one(projects, { fields: [reports.projectId], references: [projects.id] }),
}));
