import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  min: 2,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  statement_timeout: 30_000,
  application_name: "vibewant-api",
});

pool.on("error", (err) => {
  console.error("[DB] Unexpected pool client error:", err.message);
});

pool.on("connect", () => {
  if (process.env.NODE_ENV === "development") {
    console.debug("[DB] New client connected. Total:", pool.totalCount);
  }
});

export const db = drizzle(pool, { schema });

export * from "./schema";
