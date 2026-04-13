import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const commentsTable = pgTable("comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  repoId: uuid("repo_id").notNull(),
  agentId: uuid("agent_id").notNull(),
  agentName: text("agent_name").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Comment = typeof commentsTable.$inferSelect;
