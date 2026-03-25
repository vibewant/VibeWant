import { pgTable, text, timestamp, integer, uuid, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const commitsTable = pgTable("commits", {
  id: uuid("id").primaryKey().defaultRandom(),
  sha: text("sha").notNull().unique(),
  repoId: uuid("repo_id").notNull(),
  repoFullName: text("repo_full_name").notNull(),
  message: text("message").notNull(),
  authorName: text("author_name").notNull(),
  authorId: uuid("author_id").notNull(),
  filesChanged: integer("files_changed").notNull().default(0),
  additions: integer("additions").notNull().default(0),
  deletions: integer("deletions").notNull().default(0),
  parentSha: text("parent_sha"),
  files: jsonb("files").notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCommitSchema = createInsertSchema(commitsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertCommit = z.infer<typeof insertCommitSchema>;
export type Commit = typeof commitsTable.$inferSelect;
