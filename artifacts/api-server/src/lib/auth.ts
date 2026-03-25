import { Request, Response, NextFunction } from "express";
import { db, agentsTable, usersTable, userSessionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { sha256, verifyToken } from "./crypto.js";

export interface AuthenticatedRequest extends Request {
  agent?: typeof agentsTable.$inferSelect;
  user?: typeof usersTable.$inferSelect;
}

export async function requireUserSession(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const token = extractSessionToken(req);
  if (!token) {
    res.status(401).json({ error: "unauthorized", message: "Login required" });
    return;
  }

  const tokenHash = sha256(token);
  const [session] = await db
    .select({ session: userSessionsTable, user: usersTable })
    .from(userSessionsTable)
    .innerJoin(usersTable, eq(userSessionsTable.userId, usersTable.id))
    .where(eq(userSessionsTable.sessionTokenHash, tokenHash))
    .limit(1);

  if (!session || session.session.expiresAt < new Date()) {
    res.status(401).json({ error: "unauthorized", message: "Session expired" });
    return;
  }

  req.user = session.user;
  next();
}

export async function requireJWT(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers["authorization"] as string;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "unauthorized", message: "Missing Bearer token" });
    return;
  }

  const token = authHeader.slice(7);
  const payload = verifyToken(token);
  if (!payload || payload.type !== "access") {
    res.status(401).json({ error: "unauthorized", message: "Invalid or expired access token" });
    return;
  }

  const [agent] = await db
    .select()
    .from(agentsTable)
    .where(eq(agentsTable.id, payload.agentId))
    .limit(1);

  if (!agent || agent.isLocked) {
    res.status(401).json({ error: "unauthorized", message: "Agent not found or locked" });
    return;
  }

  req.agent = agent;
  next();
}

/**
 * requireAuth — accepts EITHER a permanent API key OR a JWT Bearer token.
 *
 * Priority:
 *   1. X-Agent-Key: vwk_xxx  (permanent key for automated agent calls)
 *   2. Authorization: Bearer <accessToken>  (JWT for web/UI based calls)
 *
 * This means agents can call all authenticated endpoints with their permanent
 * API key even after activation, and the web UI can use its JWT interchangeably.
 */
export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  // ── 1. Try permanent API key (X-Agent-Key) ──────────────────────
  const apiKey = req.headers["x-agent-key"] as string;
  if (apiKey) {
    const keyHash = sha256(apiKey);
    const [agent] = await db
      .select()
      .from(agentsTable)
      .where(eq(agentsTable.apiKeyHash, keyHash))
      .limit(1);

    if (agent && !agent.isLocked) {
      req.agent = agent;
      return next();
    }
    // If key was provided but invalid, reject immediately — don't fall through
    res.status(401).json({ error: "unauthorized", message: "Invalid API key" });
    return;
  }

  // ── 2. Try JWT Bearer token (Authorization: Bearer <token>) ─────
  const authHeader = req.headers["authorization"] as string;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const payload = verifyToken(token);
    if (payload && payload.type === "access") {
      const [agent] = await db
        .select()
        .from(agentsTable)
        .where(eq(agentsTable.id, payload.agentId))
        .limit(1);

      if (agent && !agent.isLocked) {
        req.agent = agent;
        return next();
      }
    }
    res.status(401).json({ error: "unauthorized", message: "Invalid or expired Bearer token" });
    return;
  }

  // ── 3. No credential provided ────────────────────────────────────
  res.status(401).json({
    error: "unauthorized",
    message: "Authentication required. Provide X-Agent-Key header or Authorization: Bearer <token>",
  });
}

export async function optionalAuth(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
) {
  // Try API key first
  const apiKey = req.headers["x-agent-key"] as string;
  if (apiKey) {
    const keyHash = sha256(apiKey);
    const [agent] = await db.select().from(agentsTable).where(eq(agentsTable.apiKeyHash, keyHash)).limit(1);
    if (agent && !agent.isLocked) {
      req.agent = agent;
      return next();
    }
  }

  // Try JWT Bearer token as fallback
  const authHeader = req.headers["authorization"] as string;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const payload = verifyToken(token);
    if (payload && payload.type === "access") {
      const [agent] = await db.select().from(agentsTable).where(eq(agentsTable.id, payload.agentId)).limit(1);
      if (agent && !agent.isLocked) req.agent = agent;
    }
  }

  next();
}

function extractSessionToken(req: Request): string | null {
  const authHeader = req.headers["authorization"] as string;
  if (authHeader?.startsWith("Bearer ")) return authHeader.slice(7);

  const cookie = req.headers["cookie"];
  if (cookie) {
    const match = cookie.match(/vw_session=([^;]+)/);
    if (match) return decodeURIComponent(match[1]);
  }

  return null;
}
