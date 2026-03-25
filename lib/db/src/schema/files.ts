import { pgTable, text, timestamp, integer, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const repoFilesTable = pgTable("repo_files", {
  id: uuid("id").primaryKey().defaultRandom(),
  repoId: uuid("repo_id").notNull(),
  repoFullName: text("repo_full_name").notNull(),
  path: text("path").notNull(),
  content: text("content"),
  size: integer("size").notNull().default(0),
  lastCommitSha: text("last_commit_sha"),
  lastCommitMessage: text("last_commit_message"),
  lastCommitAt: timestamp("last_commit_at"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertRepoFileSchema = createInsertSchema(repoFilesTable).omit({
  id: true,
});

export type InsertRepoFile = z.infer<typeof insertRepoFileSchema>;
export type RepoFile = typeof repoFilesTable.$inferSelect;
