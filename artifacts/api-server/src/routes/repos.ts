import { Router } from "express";
import { db, agentsTable, reposTable, starsTable, commitsTable, repoFilesTable } from "@workspace/db";
import { eq, and, sql, ilike, or, desc } from "drizzle-orm";
import { requireAuth, optionalAuth, AuthenticatedRequest } from "../lib/auth.js";
import { generateCommitSha } from "../lib/crypto.js";
import { ipRateLimit, agentRateLimit } from "../lib/rateLimit.js";
import { cacheGet, cacheSet, cacheDelete, TTL } from "../lib/cache.js";

const router = Router();

const MAX_SEARCH_Q      = 200;
const MAX_DESCRIPTION   = 500;
const MAX_LANGUAGE      = 50;
const MAX_TAGS          = 10;
const MAX_TAG_LENGTH    = 50;
const MAX_README        = 100_000;

function validateTags(raw: unknown): string[] | null {
  if (!raw) return [];
  if (!Array.isArray(raw)) return null;
  if (raw.length > MAX_TAGS) return null;
  for (const t of raw) {
    if (typeof t !== "string" || t.length === 0 || t.length > MAX_TAG_LENGTH) return null;
  }
  return raw as string[];
}

router.get(
  "/repos",
  ipRateLimit(60, 60 * 1000),
  async (req: AuthenticatedRequest, res) => {
    const q        = (req.query.q as string | undefined)?.slice(0, MAX_SEARCH_Q);
    const language = (req.query.language as string | undefined)?.slice(0, MAX_LANGUAGE);
    const sort     = (req.query.sort as string) || "updated";
    const page     = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit    = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
    const offset   = (page - 1) * limit;

    const cacheKey = `repos:list:${q || ""}:${language || ""}:${sort}:${page}:${limit}`;
    const cached = cacheGet<object>(cacheKey);
    if (cached) {
      res.setHeader("X-Cache", "HIT");
      res.setHeader("Cache-Control", "public, max-age=30");
      res.json(cached);
      return;
    }

    let where: any = eq(reposTable.isPublic, true);

    if (q) {
      where = and(where, or(
        ilike(reposTable.name, `%${q}%`),
        ilike(reposTable.description, `%${q}%`),
        ilike(reposTable.ownerName, `%${q}%`)
      ));
    }

    if (language) {
      where = and(where, ilike(reposTable.language, language));
    }

    const orderCol = sort === "stars"   ? desc(reposTable.starCount)
      : sort === "forks"                ? desc(reposTable.forkCount)
      : sort === "created"              ? desc(reposTable.createdAt)
      :                                   desc(reposTable.updatedAt);

    const [countResult] = await db.select({ count: sql<number>`count(*)` }).from(reposTable).where(where);
    const repos = await db.select().from(reposTable).where(where).orderBy(orderCol).limit(limit).offset(offset);

    const payload = { repos: repos.map(formatRepo), total: Number(countResult.count), page, limit };
    cacheSet(cacheKey, payload, TTL.REPO_LIST);

    res.setHeader("X-Cache", "MISS");
    res.setHeader("Cache-Control", "public, max-age=30");
    res.json(payload);
  }
);

router.post(
  "/repos",
  requireAuth,
  agentRateLimit(20, 60 * 60 * 1000),
  async (req: AuthenticatedRequest, res) => {
    const agent = req.agent!;
    const { name, description, language, tags, visibility, readme } = req.body;
    cacheDelete("repos:list");

    if (!name || typeof name !== "string") {
      res.status(400).json({ error: "bad_request", message: "name is required" });
      return;
    }

    const nameRegex = /^[a-zA-Z0-9]([a-zA-Z0-9\-_.]{0,97}[a-zA-Z0-9])?$/;
    if (!nameRegex.test(name)) {
      res.status(400).json({ error: "bad_request", message: "Invalid repository name" });
      return;
    }

    if (description !== undefined && (typeof description !== "string" || description.length > MAX_DESCRIPTION)) {
      res.status(400).json({ error: "bad_request", message: `description must be a string under ${MAX_DESCRIPTION} characters` });
      return;
    }

    if (language !== undefined && (typeof language !== "string" || language.length > MAX_LANGUAGE)) {
      res.status(400).json({ error: "bad_request", message: `language must be a string under ${MAX_LANGUAGE} characters` });
      return;
    }

    const validatedTags = validateTags(tags);
    if (validatedTags === null) {
      res.status(400).json({ error: "bad_request", message: `tags must be an array of up to ${MAX_TAGS} strings, each under ${MAX_TAG_LENGTH} characters` });
      return;
    }

    if (readme !== undefined && (typeof readme !== "string" || readme.length > MAX_README)) {
      res.status(400).json({ error: "bad_request", message: `readme must be a string under ${MAX_README} characters` });
      return;
    }

    const fullName = `${agent.name}/${name}`;
    const existing = await db.select({ id: reposTable.id }).from(reposTable).where(eq(reposTable.fullName, fullName)).limit(1);
    if (existing.length > 0) {
      res.status(409).json({ error: "conflict", message: "Repository already exists" });
      return;
    }

    const vis = visibility === "private" ? "private" : "public";

    const [repo] = await db.insert(reposTable).values({
      name,
      fullName,
      description: description?.trim() || null,
      language: language?.trim() || null,
      tags: validatedTags,
      visibility: vis,
      isPublic: vis === "public",
      ownerName: agent.name,
      ownerId: agent.id,
      readme: readme?.trim() || null,
    }).returning();

    await db.update(agentsTable)
      .set({ repoCount: sql`${agentsTable.repoCount} + 1`, updatedAt: new Date() })
      .where(eq(agentsTable.id, agent.id));

    res.status(201).json(formatRepo(repo));
  }
);

router.get("/repos/:agentName/:repoName", optionalAuth, async (req: AuthenticatedRequest, res) => {
  const { agentName, repoName } = req.params;
  const fullName = `${agentName}/${repoName}`;

  const isAnonymous = !req.agent;
  const cacheKey = `repo:detail:${fullName}`;

  if (isAnonymous) {
    const cached = cacheGet<object>(cacheKey);
    if (cached) {
      res.setHeader("X-Cache", "HIT");
      res.setHeader("Cache-Control", "public, max-age=30");
      res.json(cached);
      return;
    }
  }

  const [repo] = await db.select().from(reposTable).where(eq(reposTable.fullName, fullName)).limit(1);
  if (!repo) {
    res.status(404).json({ error: "not_found", message: "Repository not found" });
    return;
  }

  if (!repo.isPublic && (!req.agent || req.agent.id !== repo.ownerId)) {
    res.status(404).json({ error: "not_found", message: "Repository not found" });
    return;
  }

  const [owner] = await db.select().from(agentsTable).where(eq(agentsTable.name, agentName)).limit(1);

  let isStarredByMe = false;
  if (req.agent) {
    const star = await db.select().from(starsTable)
      .where(and(eq(starsTable.agentId, req.agent.id), eq(starsTable.repoId, repo.id)))
      .limit(1);
    isStarredByMe = star.length > 0;
  }

  const payload = {
    ...formatRepo(repo),
    readme: repo.readme,
    latestCommitSha: repo.latestCommitSha,
    latestCommitMessage: repo.latestCommitMessage,
    latestCommitAt: repo.latestCommitAt,
    isStarredByMe,
    owner: owner ? {
      id: owner.id, name: owner.name, description: owner.description,
      model: owner.model, framework: owner.framework, capabilities: owner.capabilities,
      avatarEmoji: owner.avatarEmoji, repoCount: owner.repoCount,
      starCount: owner.starCount, createdAt: owner.createdAt,
    } : null,
  };

  if (isAnonymous && repo.isPublic) {
    cacheSet(cacheKey, payload, TTL.REPO_DETAIL);
    res.setHeader("Cache-Control", "public, max-age=30");
    res.setHeader("X-Cache", "MISS");
  }

  res.json(payload);
});

router.delete("/repos/:agentName/:repoName", requireAuth, async (req: AuthenticatedRequest, res) => {
  const { agentName, repoName } = req.params;
  const fullName = `${agentName}/${repoName}`;
  cacheDelete(`repo:detail:${fullName}`);
  cacheDelete("repos:list");
  cacheDelete("explore:");

  const [repo] = await db.select().from(reposTable).where(eq(reposTable.fullName, fullName)).limit(1);
  if (!repo) {
    res.status(404).json({ error: "not_found", message: "Repository not found" });
    return;
  }

  if (req.agent!.id !== repo.ownerId) {
    res.status(403).json({ error: "forbidden", message: "You do not own this repository" });
    return;
  }

  await db.delete(repoFilesTable).where(eq(repoFilesTable.repoId, repo.id));
  await db.delete(commitsTable).where(eq(commitsTable.repoId, repo.id));
  await db.delete(starsTable).where(eq(starsTable.repoId, repo.id));
  await db.delete(reposTable).where(eq(reposTable.id, repo.id));
  await db.update(agentsTable)
    .set({ repoCount: sql`greatest(${agentsTable.repoCount} - 1, 0)`, updatedAt: new Date() })
    .where(eq(agentsTable.id, req.agent!.id));

  res.status(204).send();
});

router.post(
  "/repos/:agentName/:repoName/commits",
  requireAuth,
  agentRateLimit(30, 60 * 60 * 1000),
  async (req: AuthenticatedRequest, res) => {
    const { agentName, repoName } = req.params;
    const fullName = `${agentName}/${repoName}`;

    const [repo] = await db.select().from(reposTable).where(eq(reposTable.fullName, fullName)).limit(1);
    if (!repo) {
      res.status(404).json({ error: "not_found", message: "Repository not found" });
      return;
    }

    if (req.agent!.id !== repo.ownerId) {
      res.status(403).json({ error: "forbidden", message: "You do not own this repository" });
      return;
    }

    const { message, files, parentSha } = req.body;

    if (!message || !Array.isArray(files) || files.length === 0) {
      res.status(400).json({ error: "bad_request", message: "message and files are required" });
      return;
    }

    if (typeof message !== "string" || message.length > 2000) {
      res.status(400).json({ error: "bad_request", message: "Commit message must be a string under 2000 characters" });
      return;
    }

    if (files.length > 500) {
      res.status(400).json({ error: "bad_request", message: "Cannot commit more than 500 files at once" });
      return;
    }

    let totalSize = 0;
    for (const file of files) {
      if (!file.path || typeof file.path !== "string") {
        res.status(400).json({ error: "bad_request", message: "Each file must have a path string" });
        return;
      }
      const cleanPath = file.path.replace(/\.\.\//g, "").replace(/^\/+/, "");
      file.path = cleanPath;
      const contentSize = Buffer.byteLength(file.content || "", "utf8");
      totalSize += contentSize;
      if (contentSize > 5_000_000) {
        res.status(400).json({ error: "bad_request", message: `File '${cleanPath}' exceeds 5MB limit` });
        return;
      }
    }

    if (totalSize > 20_000_000) {
      res.status(400).json({ error: "bad_request", message: "Total commit size exceeds 20MB limit" });
      return;
    }

    const sha = generateCommitSha(`${fullName}:${message}:${JSON.stringify(files)}`);

    let additions = 0;
    let deletions = 0;

    for (const file of files) {
      if (file.action === "delete") {
        deletions++;
        await db.delete(repoFilesTable).where(
          and(eq(repoFilesTable.repoId, repo.id), eq(repoFilesTable.path, file.path))
        );
      } else {
        const content = file.content || "";
        const size = Buffer.byteLength(content, "utf8");
        additions++;

        const existing = await db.select().from(repoFilesTable)
          .where(and(eq(repoFilesTable.repoId, repo.id), eq(repoFilesTable.path, file.path)))
          .limit(1);

        if (existing.length > 0) {
          await db.update(repoFilesTable).set({
            content, size,
            lastCommitSha: sha,
            lastCommitMessage: message,
            lastCommitAt: new Date(),
            updatedAt: new Date(),
          }).where(eq(repoFilesTable.id, existing[0].id));
        } else {
          await db.insert(repoFilesTable).values({
            repoId: repo.id,
            repoFullName: fullName,
            path: file.path,
            content, size,
            lastCommitSha: sha,
            lastCommitMessage: message,
            lastCommitAt: new Date(),
            updatedAt: new Date(),
          });
        }
      }
    }

    const [commit] = await db.insert(commitsTable).values({
      sha,
      repoId: repo.id,
      repoFullName: fullName,
      message,
      authorName: req.agent!.name,
      authorId: req.agent!.id,
      filesChanged: files.length,
      additions,
      deletions,
      parentSha: parentSha || repo.latestCommitSha || null,
      files,
    }).returning();

    await db.update(reposTable).set({
      commitCount: sql`${reposTable.commitCount} + 1`,
      latestCommitSha: sha,
      latestCommitMessage: message,
      latestCommitAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(reposTable.id, repo.id));

    cacheDelete(`repo:detail:${fullName}`);
    cacheDelete("repos:list");
    cacheDelete("explore:");

    res.status(201).json({
      sha: commit.sha,
      message: commit.message,
      authorName: commit.authorName,
      filesChanged: commit.filesChanged,
      additions: commit.additions,
      deletions: commit.deletions,
      parentSha: commit.parentSha,
      createdAt: commit.createdAt,
    });
  }
);

router.get("/repos/:agentName/:repoName/commits", optionalAuth, async (req: AuthenticatedRequest, res) => {
  const { agentName, repoName } = req.params;
  const fullName = `${agentName}/${repoName}`;
  const page  = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
  const offset = (page - 1) * limit;

  const [repo] = await db.select({ isPublic: reposTable.isPublic, ownerId: reposTable.ownerId })
    .from(reposTable).where(eq(reposTable.fullName, fullName)).limit(1);
  if (!repo || (!repo.isPublic && (!req.agent || req.agent.id !== repo.ownerId))) {
    res.status(404).json({ error: "not_found", message: "Repository not found" });
    return;
  }

  const [countResult] = await db.select({ count: sql<number>`count(*)` }).from(commitsTable)
    .where(eq(commitsTable.repoFullName, fullName));

  const commits = await db.select().from(commitsTable)
    .where(eq(commitsTable.repoFullName, fullName))
    .orderBy(desc(commitsTable.createdAt))
    .limit(limit).offset(offset);

  res.json({
    commits: commits.map(c => ({
      sha: c.sha, message: c.message, authorName: c.authorName,
      filesChanged: c.filesChanged, additions: c.additions, deletions: c.deletions,
      parentSha: c.parentSha, createdAt: c.createdAt,
    })),
    total: Number(countResult.count), page, limit,
  });
});

router.get("/repos/:agentName/:repoName/commits/:sha", optionalAuth, async (req: AuthenticatedRequest, res) => {
  const { agentName, repoName, sha } = req.params;
  const fullName = `${agentName}/${repoName}`;

  const [repo] = await db.select({ isPublic: reposTable.isPublic, ownerId: reposTable.ownerId })
    .from(reposTable).where(eq(reposTable.fullName, fullName)).limit(1);
  if (!repo || (!repo.isPublic && (!req.agent || req.agent.id !== repo.ownerId))) {
    res.status(404).json({ error: "not_found", message: "Repository not found" });
    return;
  }

  const [commit] = await db.select().from(commitsTable)
    .where(and(eq(commitsTable.repoFullName, fullName), eq(commitsTable.sha, sha)))
    .limit(1);

  if (!commit) {
    res.status(404).json({ error: "not_found", message: "Commit not found" });
    return;
  }

  res.json({
    sha: commit.sha, message: commit.message, authorName: commit.authorName,
    filesChanged: commit.filesChanged, additions: commit.additions, deletions: commit.deletions,
    parentSha: commit.parentSha, files: commit.files, createdAt: commit.createdAt,
  });
});

router.get("/repos/:agentName/:repoName/tree", optionalAuth, async (req: AuthenticatedRequest, res) => {
  const { agentName, repoName } = req.params;
  const fullName = `${agentName}/${repoName}`;
  const pathPrefix = (req.query.path as string) || "";

  const [repoCheck] = await db.select({ isPublic: reposTable.isPublic, ownerId: reposTable.ownerId })
    .from(reposTable).where(eq(reposTable.fullName, fullName)).limit(1);
  if (!repoCheck || (!repoCheck.isPublic && (!req.agent || req.agent.id !== repoCheck.ownerId))) {
    res.status(404).json({ error: "not_found", message: "Repository not found" });
    return;
  }

  const files = await db.select().from(repoFilesTable).where(eq(repoFilesTable.repoFullName, fullName));

  const entries: any[] = [];
  const seen = new Set<string>();

  for (const file of files) {
    const relativePath = pathPrefix
      ? file.path.startsWith(pathPrefix + "/") ? file.path.slice(pathPrefix.length + 1) : null
      : file.path;

    if (!relativePath) continue;

    const parts = relativePath.split("/");
    if (parts.length === 1) {
      entries.push({
        name: parts[0], path: file.path, type: "file",
        size: file.size, lastCommitMessage: file.lastCommitMessage, lastCommitAt: file.lastCommitAt,
      });
    } else {
      const dirName = parts[0];
      const dirPath = pathPrefix ? `${pathPrefix}/${dirName}` : dirName;
      if (!seen.has(dirPath)) {
        seen.add(dirPath);
        entries.push({
          name: dirName, path: dirPath, type: "directory",
          lastCommitMessage: file.lastCommitMessage, lastCommitAt: file.lastCommitAt,
        });
      }
    }
  }

  entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  res.json({ path: pathPrefix, entries });
});

router.get("/repos/:agentName/:repoName/blob", optionalAuth, async (req: AuthenticatedRequest, res) => {
  const { agentName, repoName } = req.params;
  const fullName = `${agentName}/${repoName}`;
  const filePath = req.query.path as string;

  if (!filePath) {
    res.status(400).json({ error: "bad_request", message: "path query parameter required" });
    return;
  }

  const [repoCheck] = await db.select({ isPublic: reposTable.isPublic, ownerId: reposTable.ownerId })
    .from(reposTable).where(eq(reposTable.fullName, fullName)).limit(1);
  if (!repoCheck || (!repoCheck.isPublic && (!req.agent || req.agent.id !== repoCheck.ownerId))) {
    res.status(404).json({ error: "not_found", message: "Repository not found" });
    return;
  }

  const [file] = await db.select().from(repoFilesTable)
    .where(and(eq(repoFilesTable.repoFullName, fullName), eq(repoFilesTable.path, filePath)))
    .limit(1);

  if (!file) {
    res.status(404).json({ error: "not_found", message: "File not found" });
    return;
  }

  const ext = filePath.split(".").pop()?.toLowerCase() || "";
  const languageMap: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    py: "python", rs: "rust", go: "go", java: "java", cpp: "cpp", c: "c",
    cs: "csharp", rb: "ruby", php: "php", swift: "swift", kt: "kotlin",
    md: "markdown", json: "json", yaml: "yaml", yml: "yaml", toml: "toml",
    html: "html", css: "css", sh: "bash", sql: "sql",
  };

  res.json({
    path: file.path,
    content: file.content || "",
    size: file.size,
    encoding: "utf8",
    language: languageMap[ext] || "text",
  });
});

router.post(
  "/repos/:agentName/:repoName/star",
  requireAuth,
  agentRateLimit(60, 60 * 60 * 1000),
  async (req: AuthenticatedRequest, res) => {
    const { agentName, repoName } = req.params;
    const fullName = `${agentName}/${repoName}`;

    const [repo] = await db.select().from(reposTable).where(eq(reposTable.fullName, fullName)).limit(1);
    if (!repo) {
      res.status(404).json({ error: "not_found", message: "Repository not found" });
      return;
    }

    const existing = await db.select().from(starsTable)
      .where(and(eq(starsTable.agentId, req.agent!.id), eq(starsTable.repoId, repo.id)))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(starsTable).values({
        agentId: req.agent!.id,
        repoId: repo.id,
        agentName: req.agent!.name,
        repoFullName: fullName,
      });
      await db.update(reposTable).set({ starCount: sql`${reposTable.starCount} + 1` }).where(eq(reposTable.id, repo.id));
      await db.update(agentsTable).set({ starCount: sql`${agentsTable.starCount} + 1` }).where(eq(agentsTable.name, agentName));
      cacheDelete(`repo:detail:${fullName}`);
      cacheDelete(`agent:profile:${agentName}`);
      cacheDelete("repos:list");
      cacheDelete("explore:");
    }

    res.json({ success: true, message: "Repository starred" });
  }
);

router.delete(
  "/repos/:agentName/:repoName/star",
  requireAuth,
  agentRateLimit(60, 60 * 60 * 1000),
  async (req: AuthenticatedRequest, res) => {
    const { agentName, repoName } = req.params;
    const fullName = `${agentName}/${repoName}`;

    const [repo] = await db.select().from(reposTable).where(eq(reposTable.fullName, fullName)).limit(1);
    if (!repo) {
      res.status(404).json({ error: "not_found", message: "Repository not found" });
      return;
    }

    const deleted = await db.delete(starsTable)
      .where(and(eq(starsTable.agentId, req.agent!.id), eq(starsTable.repoId, repo.id)))
      .returning();

    if (deleted.length > 0) {
      await db.update(reposTable).set({ starCount: sql`greatest(${reposTable.starCount} - 1, 0)` }).where(eq(reposTable.id, repo.id));
      await db.update(agentsTable).set({ starCount: sql`greatest(${agentsTable.starCount} - 1, 0)` }).where(eq(agentsTable.name, agentName));
      cacheDelete(`repo:detail:${fullName}`);
      cacheDelete(`agent:profile:${agentName}`);
      cacheDelete("repos:list");
      cacheDelete("explore:");
    }

    res.json({ success: true, message: "Repository unstarred" });
  }
);

router.post(
  "/repos/:agentName/:repoName/fork",
  requireAuth,
  agentRateLimit(10, 60 * 60 * 1000),
  async (req: AuthenticatedRequest, res) => {
    const { agentName, repoName } = req.params;
    const fullName = `${agentName}/${repoName}`;

    const [repo] = await db.select().from(reposTable).where(eq(reposTable.fullName, fullName)).limit(1);
    if (!repo) {
      res.status(404).json({ error: "not_found", message: "Repository not found" });
      return;
    }

    const newFullName = `${req.agent!.name}/${repo.name}`;
    const existing = await db.select({ id: reposTable.id }).from(reposTable).where(eq(reposTable.fullName, newFullName)).limit(1);
    if (existing.length > 0) {
      res.status(409).json({ error: "conflict", message: "You already have a repository with this name" });
      return;
    }

    const [forked] = await db.insert(reposTable).values({
      name: repo.name,
      fullName: newFullName,
      description: repo.description,
      language: repo.language,
      tags: repo.tags,
      visibility: "public",
      isPublic: true,
      ownerName: req.agent!.name,
      ownerId: req.agent!.id,
      forkedFromId: repo.id,
      readme: repo.readme,
    }).returning();

    await db.update(reposTable).set({ forkCount: sql`${reposTable.forkCount} + 1` }).where(eq(reposTable.id, repo.id));
    await db.update(agentsTable).set({ repoCount: sql`${agentsTable.repoCount} + 1`, updatedAt: new Date() }).where(eq(agentsTable.id, req.agent!.id));

    cacheDelete(`repo:detail:${fullName}`);
    cacheDelete(`agent:repos:${req.agent!.name}`);
    cacheDelete(`agent:profile:${req.agent!.name}`);
    cacheDelete("repos:list");
    cacheDelete("explore:");

    res.status(201).json(formatRepo(forked));
  }
);

router.get(
  "/explore/trending",
  ipRateLimit(60, 60 * 1000),
  async (req, res) => {
    const language = (req.query.language as string | undefined)?.slice(0, MAX_LANGUAGE);
    const period   = (req.query.period as string) || "weekly";
    const cacheKey = `explore:trending:${period}:${language || ""}`;

    const cached = cacheGet<object>(cacheKey);
    if (cached) {
      res.setHeader("X-Cache", "HIT");
      res.setHeader("Cache-Control", "public, max-age=60");
      res.json(cached);
      return;
    }

    const days  = period === "daily" ? 1 : period === "monthly" ? 30 : 7;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    let where: any = and(eq(reposTable.isPublic, true), sql`${reposTable.updatedAt} > ${since}`);
    if (language) {
      where = and(where, ilike(reposTable.language, language));
    }

    const repos = await db.select().from(reposTable)
      .where(where)
      .orderBy(desc(reposTable.starCount))
      .limit(20);

    const payload = { repos: repos.map(formatRepo), total: repos.length, page: 1, limit: 20 };
    cacheSet(cacheKey, payload, TTL.EXPLORE_TRENDING);

    res.setHeader("X-Cache", "MISS");
    res.setHeader("Cache-Control", "public, max-age=60");
    res.json(payload);
  }
);

router.get(
  "/explore/languages",
  ipRateLimit(30, 60 * 1000),
  async (_req, res) => {
    const cacheKey = "explore:languages";
    const cached = cacheGet<object>(cacheKey);
    if (cached) {
      res.setHeader("X-Cache", "HIT");
      res.setHeader("Cache-Control", "public, max-age=300");
      res.json(cached);
      return;
    }

    const results = await db.select({
      language: reposTable.language,
      count: sql<number>`count(*)`,
    }).from(reposTable)
      .where(and(eq(reposTable.isPublic, true), sql`${reposTable.language} is not null`))
      .groupBy(reposTable.language)
      .orderBy(desc(sql`count(*)`));

    const languageColors: Record<string, string> = {
      TypeScript: "#3178c6", JavaScript: "#f1e05a", Python: "#3572A5",
      Rust: "#dea584", Go: "#00ADD8", Java: "#b07219", "C++": "#f34b7d",
      C: "#555555", "C#": "#178600", Ruby: "#701516", PHP: "#4F5D95",
      Swift: "#F05138", Kotlin: "#A97BFF", HTML: "#e34c26", CSS: "#563d7c",
      Shell: "#89e051", SQL: "#e38c00", Markdown: "#083fa1",
    };

    const payload = {
      languages: results.map(r => ({
        language: r.language,
        count: Number(r.count),
        color: languageColors[r.language || ""] || "#6e7681",
      })),
    };
    cacheSet(cacheKey, payload, TTL.EXPLORE_LANGUAGES);

    res.setHeader("X-Cache", "MISS");
    res.setHeader("Cache-Control", "public, max-age=300");
    res.json(payload);
  }
);

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

/* ─── Unified search ─────────────────────────────────────────────── */
router.get(
  "/search",
  ipRateLimit(60, 60 * 1000),
  async (req, res) => {
    const q = (req.query.q as string | undefined)?.trim().slice(0, 100) ?? "";
    if (q.length < 2) {
      res.json({ agents: [], repos: [] });
      return;
    }

    const pattern = `%${q}%`;

    const [agentRows, repoRows] = await Promise.all([
      db.select({
        name:        agentsTable.name,
        description: agentsTable.description,
        bio:         agentsTable.bio,
        specialty:   agentsTable.specialty,
        avatarUrl:   agentsTable.avatarUrl,
        avatarEmoji: agentsTable.avatarEmoji,
        repoCount:   agentsTable.repoCount,
        starCount:   agentsTable.starCount,
      })
        .from(agentsTable)
        .where(or(
          ilike(agentsTable.name,        pattern),
          ilike(agentsTable.description, pattern),
          ilike(agentsTable.bio,         pattern),
          ilike(agentsTable.specialty,   pattern),
        ))
        .orderBy(desc(agentsTable.starCount))
        .limit(8),

      db.select()
        .from(reposTable)
        .where(and(
          eq(reposTable.isPublic, true),
          or(
            ilike(reposTable.name,        pattern),
            ilike(reposTable.description, pattern),
            ilike(reposTable.ownerName,   pattern),
            sql`CAST(${reposTable.tags} AS TEXT) ILIKE ${pattern}`,
            sql`EXISTS (
              SELECT 1 FROM ${commitsTable}
              WHERE ${commitsTable.repoId} = ${reposTable.id}
              AND   ${commitsTable.message} ILIKE ${pattern}
            )`,
          )
        ))
        .orderBy(desc(reposTable.starCount))
        .limit(20),
    ]);

    res.json({ agents: agentRows, repos: repoRows.map(formatRepo) });
  }
);

export default router;
