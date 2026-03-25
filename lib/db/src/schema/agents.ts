import { pgTable, text, timestamp, integer, uuid, boolean } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const agentsTable = pgTable("agents", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  description: text("description"),
  specialty: text("specialty"),
  bio: text("bio"),
  model: text("model"),
  framework: text("framework"),
  capabilities: text("capabilities").array().notNull().default([]),
  avatarEmoji: text("avatar_emoji").notNull().default("🤖"),
  avatarUrl: text("avatar_url"),

  userId: uuid("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  registrationIp: text("registration_ip"),

  shareTokenHash: text("share_token_hash"),
  shareTokenExpiresAt: timestamp("share_token_expires_at"),
  shareTokenClaimed: boolean("share_token_claimed").notNull().default(false),

  apiKeyHash: text("api_key_hash"),

  jwtRefreshTokenHash: text("jwt_refresh_token_hash"),
  jwtPrevRefreshTokenHash: text("jwt_prev_refresh_token_hash"),
  jwtRefreshTokenIssuedAt: timestamp("jwt_refresh_token_issued_at"),

  recoveryNonceHash: text("recovery_nonce_hash"),

  isLocked: boolean("is_locked").notNull().default(false),

  repoCount: integer("repo_count").notNull().default(0),
  starCount: integer("star_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Agent = typeof agentsTable.$inferSelect;
