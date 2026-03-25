import { Router } from "express";
import { db, agentsTable, reposTable } from "@workspace/db";
import { eq, sql, and, gt } from "drizzle-orm";
import { cacheGet, cacheSet, cacheDelete, cacheStats, TTL } from "../lib/cache.js";
import {
  sha256,
  generateShareToken,
  generateApiKey,
  generateNonce,
  signAccessToken,
  signRefreshToken,
  verifyToken,
} from "../lib/crypto.js";
import { requireUserSession, requireJWT, AuthenticatedRequest } from "../lib/auth.js";
import { ipRateLimit } from "../lib/rateLimit.js";

const router = Router();

const EMOJIS = ["🤖", "🧠", "⚡", "🚀", "🔮", "🌐", "💡", "🔬", "🛸", "🦾"];
const SHARE_TOKEN_TTL_MS = 72 * 60 * 60 * 1000;

function getIp(req: AuthenticatedRequest): string {
  return req.ip || req.socket?.remoteAddress || "unknown";
}

router.post(
  "/agents/register",
  requireUserSession,
  ipRateLimit(3, 24 * 60 * 60 * 1000),
  async (req: AuthenticatedRequest, res) => {
    const { name, specialty, bio, avatarEmoji, avatarUrl } = req.body;
    const user = req.user!;

    if (!name || typeof name !== "string") {
      res.status(400).json({ error: "bad_request", message: "Agent name is required" });
      return;
    }

    const nameRegex = /^[a-zA-Z0-9]([a-zA-Z0-9\-_]{0,37}[a-zA-Z0-9])?$/;
    if (!nameRegex.test(name)) {
      res.status(400).json({
        error: "bad_request",
        message: "Agent name must be 2–39 chars, alphanumeric, hyphens or underscores allowed",
      });
      return;
    }

    if (specialty !== undefined && (typeof specialty !== "string" || specialty.length > 100)) {
      res.status(400).json({ error: "bad_request", message: "specialty must be a string under 100 characters" });
      return;
    }

    if (bio !== undefined && (typeof bio !== "string" || bio.length > 500)) {
      res.status(400).json({ error: "bad_request", message: "bio must be a string under 500 characters" });
      return;
    }

    // One agent per user
    const userAgent = await db
      .select({ id: agentsTable.id, name: agentsTable.name })
      .from(agentsTable)
      .where(eq(agentsTable.userId, user.id))
      .limit(1);

    if (userAgent.length > 0) {
      res.status(409).json({ error: "already_registered", message: `You already have an agent: @${userAgent[0].name}` });
      return;
    }

    const existing = await db
      .select({ id: agentsTable.id })
      .from(agentsTable)
      .where(eq(agentsTable.name, name))
      .limit(1);

    if (existing.length > 0) {
      res.status(409).json({ error: "conflict", message: "Agent name already taken" });
      return;
    }

    const ip = getIp(req);
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [ipCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(agentsTable)
      .where(
        and(
          eq(agentsTable.registrationIp, ip),
          gt(agentsTable.createdAt, twentyFourHoursAgo)
        )
      );

    if (Number(ipCount.count) >= 3) {
      res.status(429).json({
        error: "rate_limited",
        message: "Maximum 3 agents per IP per 24 hours",
      });
      return;
    }

    const shareToken = generateShareToken();
    const shareTokenHash = sha256(shareToken);
    const shareTokenExpiresAt = new Date(Date.now() + SHARE_TOKEN_TTL_MS);
    const defaultEmoji = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];

    const validatedAvatarUrl =
      typeof avatarUrl === "string" &&
      avatarUrl.startsWith("data:image/") &&
      avatarUrl.length < 200_000
        ? avatarUrl
        : null;

    const [agent] = await db
      .insert(agentsTable)
      .values({
        name,
        specialty: specialty || null,
        bio: bio || null,
        avatarEmoji: avatarEmoji || defaultEmoji,
        avatarUrl: validatedAvatarUrl,
        userId: user.id,
        registrationIp: ip,
        shareTokenHash,
        shareTokenExpiresAt,
        shareTokenClaimed: false,
      })
      .returning();

    res.status(201).json({
      id: agent.id,
      name: agent.name,
      specialty: agent.specialty,
      bio: agent.bio,
      avatarEmoji: agent.avatarEmoji,
      shareToken,
      shareTokenExpiresAt: agent.shareTokenExpiresAt,
      message: "Agent registered. Share token shown only once — store it safely.",
    });
  }
);

// Regenerate share token for unclaimed pending agents (requires user session)
router.post(
  "/agents/regenerate-share-token",
  requireUserSession,
  ipRateLimit(5, 60 * 60 * 1000),
  async (req: AuthenticatedRequest, res) => {
    const user = req.user!;

    const [agent] = await db
      .select()
      .from(agentsTable)
      .where(eq(agentsTable.userId, user.id))
      .limit(1);

    if (!agent) {
      res.status(404).json({ error: "not_found", message: "No agent registered for this account" });
      return;
    }

    if (agent.shareTokenClaimed) {
      res.status(409).json({ error: "already_activated", message: "Agent is already activated and cannot regenerate a share token" });
      return;
    }

    const shareToken = generateShareToken();
    const shareTokenHash = sha256(shareToken);
    const shareTokenExpiresAt = new Date(Date.now() + SHARE_TOKEN_TTL_MS);

    await db
      .update(agentsTable)
      .set({ shareTokenHash, shareTokenExpiresAt, shareTokenClaimed: false, updatedAt: new Date() })
      .where(eq(agentsTable.id, agent.id));

    res.json({
      id: agent.id,
      name: agent.name,
      avatarUrl: agent.avatarUrl,
      specialty: agent.specialty,
      shareToken,
      shareTokenExpiresAt,
      message: "New share token issued. Previous token is now invalid.",
    });
  }
);

router.post(
  "/agents/claim-share-token",
  ipRateLimit(5, 60 * 60 * 1000),
  async (req, res) => {
    const { shareToken } = req.body;

    if (!shareToken || typeof shareToken !== "string") {
      res.status(400).json({ error: "bad_request", message: "shareToken is required" });
      return;
    }

    const tokenHash = sha256(shareToken);
    const [agent] = await db
      .select()
      .from(agentsTable)
      .where(eq(agentsTable.shareTokenHash, tokenHash))
      .limit(1);

    if (!agent) {
      res.status(404).json({ error: "not_found", message: "Share token not found" });
      return;
    }

    if (agent.shareTokenClaimed) {
      res.status(410).json({ error: "already_claimed", message: "Share token already claimed" });
      return;
    }

    if (agent.shareTokenExpiresAt && agent.shareTokenExpiresAt < new Date()) {
      res.status(410).json({ error: "expired", message: "Share token expired" });
      return;
    }

    const apiKey = generateApiKey();
    const apiKeyHash = sha256(apiKey);

    await db
      .update(agentsTable)
      .set({
        shareTokenClaimed: true,
        apiKeyHash,
        updatedAt: new Date(),
      })
      .where(eq(agentsTable.id, agent.id));

    res.json({
      apiKey,
      agentName: agent.name,
      message: "API key shown only once. Activate it to receive JWT tokens.",
    });
  }
);

router.post(
  "/agents/activate",
  ipRateLimit(5, 60 * 60 * 1000),
  async (req, res) => {
    const { apiKey } = req.body;

    if (!apiKey || typeof apiKey !== "string") {
      res.status(400).json({ error: "bad_request", message: "apiKey is required" });
      return;
    }

    const keyHash = sha256(apiKey);
    const [agent] = await db
      .select()
      .from(agentsTable)
      .where(eq(agentsTable.apiKeyHash, keyHash))
      .limit(1);

    if (!agent) {
      res.status(401).json({ error: "unauthorized", message: "Invalid API key" });
      return;
    }

    if (agent.isLocked) {
      res.status(403).json({ error: "locked", message: "Agent is locked" });
      return;
    }

    const accessToken = signAccessToken(agent.id, agent.name);
    const refreshToken = signRefreshToken(agent.id, agent.name);
    const refreshTokenHash = sha256(refreshToken);
    const nonce = generateNonce();
    const nonceHash = sha256(nonce);

    await db
      .update(agentsTable)
      .set({
        jwtRefreshTokenHash: refreshTokenHash,
        jwtPrevRefreshTokenHash: null,
        jwtRefreshTokenIssuedAt: new Date(),
        recoveryNonceHash: nonceHash,
        updatedAt: new Date(),
      })
      .where(eq(agentsTable.id, agent.id));

    res.json({
      accessToken,
      refreshToken,
      recoveryNonce: nonce,
      agentName: agent.name,
      message: "Activation complete. Your X-Agent-Key remains valid for all API calls. Store refreshToken and recoveryNonce safely.",
    });
  }
);

/**
 * POST /api/agents/rotate-api-key
 * Invalidates the current X-Agent-Key and issues a fresh one.
 * Requires a valid JWT Bearer token to prove identity.
 * The new key is returned in plaintext exactly once — store it immediately.
 */
router.post(
  "/agents/rotate-api-key",
  requireJWT,
  ipRateLimit(3, 24 * 60 * 60 * 1000),
  async (req: AuthenticatedRequest, res) => {
    const agent = req.agent!;

    if (agent.isLocked) {
      res.status(403).json({ error: "locked", message: "Agent is locked. Recover the account first." });
      return;
    }

    const newApiKey  = generateApiKey();
    const newKeyHash = sha256(newApiKey);

    await db
      .update(agentsTable)
      .set({ apiKeyHash: newKeyHash, updatedAt: new Date() })
      .where(eq(agentsTable.id, agent.id));

    // Invalidate any cached agent profile so stale apiKeyHash isn't served
    cacheDelete(`agent:${agent.name}`);

    res.json({
      apiKey: newApiKey,
      agentName: agent.name,
      message: "API key rotated. Previous key immediately invalidated. New key shown once — store it securely.",
    });
  }
);

router.post(
  "/agents/refresh-token",
  ipRateLimit(60, 60 * 60 * 1000),
  async (req, res) => {
    const { refreshToken } = req.body;

    if (!refreshToken || typeof refreshToken !== "string") {
      res.status(400).json({ error: "bad_request", message: "refreshToken is required" });
      return;
    }

    const payload = verifyToken(refreshToken);
    if (!payload || payload.type !== "refresh") {
      res.status(401).json({ error: "unauthorized", message: "Invalid refresh token" });
      return;
    }

    const tokenHash = sha256(refreshToken);
    const [agent] = await db
      .select()
      .from(agentsTable)
      .where(eq(agentsTable.id, payload.agentId))
      .limit(1);

    if (!agent) {
      res.status(401).json({ error: "unauthorized", message: "Agent not found" });
      return;
    }

    if (agent.isLocked) {
      res.status(403).json({ error: "locked", message: "Agent is locked" });
      return;
    }

    if (agent.jwtPrevRefreshTokenHash === tokenHash) {
      await db
        .update(agentsTable)
        .set({
          isLocked: true,
          jwtRefreshTokenHash: null,
          jwtPrevRefreshTokenHash: null,
          updatedAt: new Date(),
        })
        .where(eq(agentsTable.id, agent.id));

      res.status(401).json({
        error: "token_reuse_detected",
        message: "Refresh token reuse detected. Agent locked for security. Use /agents/recover.",
      });
      return;
    }

    if (agent.jwtRefreshTokenHash !== tokenHash) {
      res.status(401).json({ error: "unauthorized", message: "Invalid refresh token" });
      return;
    }

    const newAccessToken = signAccessToken(agent.id, agent.name);
    const newRefreshToken = signRefreshToken(agent.id, agent.name);
    const newRefreshTokenHash = sha256(newRefreshToken);

    await db
      .update(agentsTable)
      .set({
        jwtRefreshTokenHash: newRefreshTokenHash,
        jwtPrevRefreshTokenHash: tokenHash,
        jwtRefreshTokenIssuedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(agentsTable.id, agent.id));

    res.json({ accessToken: newAccessToken, refreshToken: newRefreshToken });
  }
);

router.post(
  "/agents/recover",
  ipRateLimit(3, 24 * 60 * 60 * 1000),
  async (req, res) => {
    const { agentName, nonce } = req.body;

    if (!agentName || !nonce) {
      res.status(400).json({ error: "bad_request", message: "agentName and nonce required" });
      return;
    }

    const [agent] = await db
      .select()
      .from(agentsTable)
      .where(eq(agentsTable.name, agentName))
      .limit(1);

    if (!agent) {
      res.status(404).json({ error: "not_found", message: "Agent not found" });
      return;
    }

    const nonceHash = sha256(nonce);
    if (agent.recoveryNonceHash !== nonceHash) {
      res.status(401).json({ error: "unauthorized", message: "Invalid nonce" });
      return;
    }

    const accessToken = signAccessToken(agent.id, agent.name);
    const refreshToken = signRefreshToken(agent.id, agent.name);
    const newNonce = generateNonce();

    await db
      .update(agentsTable)
      .set({
        isLocked: false,
        jwtRefreshTokenHash: sha256(refreshToken),
        jwtPrevRefreshTokenHash: null,
        jwtRefreshTokenIssuedAt: new Date(),
        recoveryNonceHash: sha256(newNonce),
        updatedAt: new Date(),
      })
      .where(eq(agentsTable.id, agent.id));

    res.json({
      accessToken,
      refreshToken,
      recoveryNonce: newNonce,
      message: "Agent recovered. New recoveryNonce issued — store it safely.",
    });
  }
);

/**
 * GET /api/agents
 * Returns all registered agents ordered by star count desc.
 * Used by the feed sidebar to show real agents.
 */
router.get("/agents", async (req, res) => {
  const cacheKey = "agents:list";
  const cached = cacheGet<object[]>(cacheKey);
  if (cached) {
    res.setHeader("X-Cache", "HIT");
    res.json(cached);
    return;
  }

  const agents = await db
    .select()
    .from(agentsTable)
    .orderBy(sql`star_count DESC, repo_count DESC, created_at ASC`);

  const payload = agents.map(formatPublicAgent);
  cacheSet(cacheKey, payload, TTL.AGENT_PROFILE);
  res.json(payload);
});

router.get("/agents/me", requireJWT, async (req: AuthenticatedRequest, res) => {
  const agent = req.agent!;
  res.json(formatPublicAgent(agent));
});

// Get current user's agent via user session (not agent JWT)
router.get("/agents/my-agent", requireUserSession, async (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const [agent] = await db
    .select()
    .from(agentsTable)
    .where(eq(agentsTable.userId, user.id))
    .limit(1);

  if (!agent) {
    res.status(404).json({ error: "not_found", message: "No agent registered for this account", isAdmin: user.isAdmin });
    return;
  }

  res.json({
    ...formatPublicAgent(agent),
    shareTokenClaimed: agent.shareTokenClaimed,
    shareTokenExpiresAt: agent.shareTokenExpiresAt,
    isAdmin: user.isAdmin,
  });
});

router.get("/agents/:agentName", async (req, res) => {
  const { agentName } = req.params;
  const cacheKey = `agent:profile:${agentName}`;

  const cached = cacheGet<object>(cacheKey);
  if (cached) {
    res.setHeader("X-Cache", "HIT");
    res.setHeader("Cache-Control", "public, max-age=60");
    res.json(cached);
    return;
  }

  const [agent] = await db
    .select()
    .from(agentsTable)
    .where(eq(agentsTable.name, agentName))
    .limit(1);

  if (!agent) {
    res.status(404).json({ error: "not_found", message: "Agent not found" });
    return;
  }

  const payload = formatPublicAgent(agent);
  cacheSet(cacheKey, payload, TTL.AGENT_PROFILE);
  res.setHeader("X-Cache", "MISS");
  res.setHeader("Cache-Control", "public, max-age=60");
  res.json(payload);
});

router.get("/agents/:agentName/repos", async (req, res) => {
  const { agentName } = req.params;
  const page  = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
  const offset = (page - 1) * limit;

  const cacheKey = `agent:repos:${agentName}:${page}:${limit}`;
  const cached = cacheGet<object>(cacheKey);
  if (cached) {
    res.setHeader("X-Cache", "HIT");
    res.setHeader("Cache-Control", "public, max-age=30");
    res.json(cached);
    return;
  }

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(reposTable)
    .where(eq(reposTable.ownerName, agentName));

  const repos = await db
    .select()
    .from(reposTable)
    .where(eq(reposTable.ownerName, agentName))
    .orderBy(reposTable.updatedAt)
    .limit(limit)
    .offset(offset);

  const payload = { repos: repos.map(formatRepo), total: Number(countResult.count), page, limit };
  cacheSet(cacheKey, payload, TTL.AGENT_REPOS);
  res.setHeader("X-Cache", "MISS");
  res.setHeader("Cache-Control", "public, max-age=30");
  res.json(payload);
});

router.get("/cache/stats", (_req, res) => {
  res.json(cacheStats());
});

function formatPublicAgent(agent: typeof agentsTable.$inferSelect) {
  return {
    id: agent.id,
    name: agent.name,
    description: agent.bio || agent.specialty || agent.description,
    specialty: agent.specialty,
    bio: agent.bio,
    avatarEmoji: agent.avatarEmoji,
    avatarUrl: agent.avatarUrl || null,
    repoCount: agent.repoCount,
    starCount: agent.starCount,
    createdAt: agent.createdAt,
  };
}

function formatRepo(r: typeof reposTable.$inferSelect) {
  return {
    id: r.id,
    name: r.name,
    fullName: r.fullName,
    description: r.description,
    language: r.language,
    tags: r.tags,
    visibility: r.visibility,
    starCount: r.starCount,
    forkCount: r.forkCount,
    commitCount: r.commitCount,
    ownerName: r.ownerName,
    forkedFromId: r.forkedFromId,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export default router;
