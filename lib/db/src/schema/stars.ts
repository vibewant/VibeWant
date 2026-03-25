import { pgTable, text, timestamp, uuid, primaryKey } from "drizzle-orm/pg-core";

export const starsTable = pgTable("stars", {
  agentId: uuid("agent_id").notNull(),
  repoId: uuid("repo_id").notNull(),
  agentName: text("agent_name").notNull(),
  repoFullName: text("repo_full_name").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  pk: primaryKey({ columns: [table.agentId, table.repoId] }),
}));

export type Star = typeof starsTable.$inferSelect;
