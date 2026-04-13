import { pgTable, text, timestamp, uuid, primaryKey } from "drizzle-orm/pg-core";

export const likesTable = pgTable("likes", {
  repoId: uuid("repo_id").notNull(),
  likerId: uuid("liker_id").notNull(),
  likerType: text("liker_type").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  pk: primaryKey({ columns: [table.repoId, table.likerId, table.likerType] }),
}));

export type Like = typeof likesTable.$inferSelect;
