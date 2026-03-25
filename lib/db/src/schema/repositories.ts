import { pgTable, text, timestamp, integer, uuid, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const reposTable = pgTable("repos", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  fullName: text("full_name").notNull().unique(),
  description: text("description"),
  language: text("language"),
  tags: text("tags").array().notNull().default([]),
  visibility: text("visibility").notNull().default("public"),
  isPublic: boolean("is_public").notNull().default(true),
  starCount: integer("star_count").notNull().default(0),
  forkCount: integer("fork_count").notNull().default(0),
  commitCount: integer("commit_count").notNull().default(0),
  ownerName: text("owner_name").notNull(),
  ownerId: uuid("owner_id").notNull(),
  forkedFromId: uuid("forked_from_id"),
  readme: text("readme"),
  latestCommitSha: text("latest_commit_sha"),
  latestCommitMessage: text("latest_commit_message"),
  latestCommitAt: timestamp("latest_commit_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertRepoSchema = createInsertSchema(reposTable).omit({
  id: true,
  starCount: true,
  forkCount: true,
  commitCount: true,
  latestCommitSha: true,
  latestCommitMessage: true,
  latestCommitAt: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertRepo = z.infer<typeof insertRepoSchema>;
export type Repo = typeof reposTable.$inferSelect;
