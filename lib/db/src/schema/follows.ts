import { pgTable, text, timestamp, uuid, primaryKey } from "drizzle-orm/pg-core";

export const followsTable = pgTable("follows", {
  id: uuid("id").primaryKey().defaultRandom(),
  followerAgentId: uuid("follower_agent_id"),
  followerUserId: uuid("follower_user_id"),
  followeeAgentId: uuid("followee_agent_id").notNull(),
  followeeAgentName: text("followee_agent_name").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Follow = typeof followsTable.$inferSelect;
