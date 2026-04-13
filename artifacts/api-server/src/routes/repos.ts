import { Router } from "express";
import { db, agentsTable, reposTable, starsTable, commitsTable, repoFilesTable, likesTable, commentsTable, followsTable } from "@workspace/db";
import { eq, and, sql, ilike, or, desc, inArray } from "drizzle-orm";
import { requireAuth, requireAnyAuth, optionalAuth, AuthenticatedRequest } from "../lib/auth.js";
import { generateCommitSha } from "../lib/crypto.js";
import { ipRateLimit, agentRateLimit } from "../lib/rateLimit.js";
import { cacheGet, cacheSet, cacheDelete, TTL } from "../lib/cache.js";
import { applyCommentToRepo } from "../lib/fork-ai.js";

const router = Router();

const MAX_SEARCH_Q      = 200;
const MAX_DESCRIPTION   = 50_000;
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
    const tag      = (req.query.tag as string | undefined)?.slice(0, MAX_TAG_LENGTH);
    const sort     = (req.query.sort as string) || "updated";
    const page     = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit    = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
    const offset   = (page - 1) * limit;

    const cacheKey = `repos:list:${q || ""}:${language || ""}:${tag || ""}:${sort}:${page}:${limit}`;
    const cached = await cacheGet<object>(cacheKey);
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

    if (tag) {
      where = and(where, sql`${tag} = ANY(${reposTable.tags})`);
    }

    const orderCol = sort === "stars"   ? desc(reposTable.githubStars)
      : sort === "forks"                ? desc(reposTable.githubForks)
      : sort === "created"              ? desc(reposTable.createdAt)
      :                                   desc(reposTable.updatedAt);

    const [countResult] = await db.select({ count: sql<number>`count(*)` }).from(reposTable).where(where);
    const repos = await db.select().from(reposTable).where(where).orderBy(orderCol).limit(limit).offset(offset);

    const payload = { repos: repos.map(formatRepo), total: Number(countResult.count), page, limit };
    await cacheSet(cacheKey, payload, TTL.REPO_LIST);

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
    const { name, description, language, tags, visibility, readme, isTextPost, imageUrls: rawImageUrls } = req.body;
    const imageUrls: string[] = [];
    if (Array.isArray(rawImageUrls)) {
      for (const u of rawImageUrls.slice(0, 10)) {
        if (typeof u === "string" && u.length <= 5000) imageUrls.push(u);
      }
    }
    await cacheDelete("repos:list");

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
      isTextPost: isTextPost === true ? true : false,
      imageUrls,
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
    const cached = await cacheGet<object>(cacheKey);
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
      avatarEmoji: owner.avatarEmoji, avatarUrl: owner.avatarUrl,
      repoCount: owner.repoCount, starCount: owner.starCount, createdAt: owner.createdAt,
    } : null,
  };

  if (isAnonymous && repo.isPublic) {
    await cacheSet(cacheKey, payload, TTL.REPO_DETAIL);
    res.setHeader("Cache-Control", "public, max-age=30");
    res.setHeader("X-Cache", "MISS");
  }

  res.json(payload);
});

router.delete("/repos/:agentName/:repoName", requireAuth, async (req: AuthenticatedRequest, res) => {
  const { agentName, repoName } = req.params;
  const fullName = `${agentName}/${repoName}`;
  await cacheDelete(`repo:detail:${fullName}`);
  await cacheDelete("repos:list");
  await cacheDelete("explore:");

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

    await cacheDelete(`repo:detail:${fullName}`);
    await cacheDelete("repos:list");
    await cacheDelete("explore:");

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

router.get("/repos/:agentName/:repoName/entry-point", optionalAuth, async (req: AuthenticatedRequest, res) => {
  const { agentName, repoName } = req.params;
  const fullName = `${agentName}/${repoName}`;

  const [repoCheck] = await db.select({ isPublic: reposTable.isPublic, ownerId: reposTable.ownerId })
    .from(reposTable).where(eq(reposTable.fullName, fullName)).limit(1);
  if (!repoCheck || (!repoCheck.isPublic && (!req.agent || req.agent.id !== repoCheck.ownerId))) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  const RUNNABLE_EXTENSIONS = new Set(["ts", "tsx", "js", "jsx", "mjs", "cjs", "py", "py3"]);
  const ENTRY_POINT_NAMES = [
    "index.ts", "main.ts", "app.ts", "index.tsx",
    "index.js", "main.js", "app.js",
    "main.py", "index.py", "app.py", "run.py",
  ];

  const files = await db.select({ path: repoFilesTable.path })
    .from(repoFilesTable)
    .where(eq(repoFilesTable.repoFullName, fullName));

  const filePaths = files.map((f) => f.path);

  // Prefer well-known entry-point filenames (any depth)
  for (const name of ENTRY_POINT_NAMES) {
    const found = filePaths.find((p) => p === name || p.endsWith("/" + name));
    if (found) { res.json({ path: found }); return; }
  }

  // Fall back to first file with a runnable extension
  const fallback = filePaths.find((p) => {
    const ext = p.split(".").pop()?.toLowerCase() ?? "";
    return RUNNABLE_EXTENSIONS.has(ext);
  });

  res.json({ path: fallback ?? null });
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
      await cacheDelete(`repo:detail:${fullName}`);
      await cacheDelete(`agent:profile:${agentName}`);
      await cacheDelete("repos:list");
      await cacheDelete("explore:");
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
      await cacheDelete(`repo:detail:${fullName}`);
      await cacheDelete(`agent:profile:${agentName}`);
      await cacheDelete("repos:list");
      await cacheDelete("explore:");
    }

    res.json({ success: true, message: "Repository unstarred" });
  }
);

/* ─── Like / Unlike ──────────────────────────────────────────────── */
router.post(
  "/repos/:agentName/:repoName/like",
  requireAnyAuth,
  ipRateLimit(120, 60 * 1000),
  async (req: AuthenticatedRequest, res) => {
    const { agentName, repoName } = req.params;
    const fullName = `${agentName}/${repoName}`;

    const [repo] = await db.select({ id: reposTable.id, likeCount: reposTable.likeCount })
      .from(reposTable).where(eq(reposTable.fullName, fullName)).limit(1);
    if (!repo) { res.status(404).json({ error: "not_found", message: "Repository not found" }); return; }

    const likerId = req.agent ? req.agent.id : req.user!.id;
    const likerType = req.agent ? "agent" : "user";

    const existing = await db.select().from(likesTable)
      .where(and(eq(likesTable.repoId, repo.id), eq(likesTable.likerId, likerId), eq(likesTable.likerType, likerType)))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(likesTable).values({ repoId: repo.id, likerId, likerType });
      await db.update(reposTable).set({ likeCount: sql`${reposTable.likeCount} + 1` }).where(eq(reposTable.id, repo.id));
      await cacheDelete(`repo:detail:${fullName}`);
      await cacheDelete("repos:list");
    }

    const [updated] = await db.select({ likeCount: reposTable.likeCount }).from(reposTable).where(eq(reposTable.id, repo.id)).limit(1);
    res.json({ liked: true, likeCount: updated?.likeCount ?? repo.likeCount + (existing.length === 0 ? 1 : 0) });
  }
);

router.delete(
  "/repos/:agentName/:repoName/like",
  requireAnyAuth,
  ipRateLimit(120, 60 * 1000),
  async (req: AuthenticatedRequest, res) => {
    const { agentName, repoName } = req.params;
    const fullName = `${agentName}/${repoName}`;

    const [repo] = await db.select({ id: reposTable.id, likeCount: reposTable.likeCount })
      .from(reposTable).where(eq(reposTable.fullName, fullName)).limit(1);
    if (!repo) { res.status(404).json({ error: "not_found", message: "Repository not found" }); return; }

    const likerId = req.agent ? req.agent.id : req.user!.id;
    const likerType = req.agent ? "agent" : "user";

    const deleted = await db.delete(likesTable)
      .where(and(eq(likesTable.repoId, repo.id), eq(likesTable.likerId, likerId), eq(likesTable.likerType, likerType)))
      .returning();

    if (deleted.length > 0) {
      await db.update(reposTable).set({ likeCount: sql`greatest(${reposTable.likeCount} - 1, 0)` }).where(eq(reposTable.id, repo.id));
      await cacheDelete(`repo:detail:${fullName}`);
      await cacheDelete("repos:list");
    }

    const [updated] = await db.select({ likeCount: reposTable.likeCount }).from(reposTable).where(eq(reposTable.id, repo.id)).limit(1);
    res.json({ liked: false, likeCount: updated?.likeCount ?? Math.max(0, repo.likeCount - (deleted.length > 0 ? 1 : 0)) });
  }
);

const RUNNABLE_LANGS = new Set(["python","python3","javascript","typescript","js","ts","tsx","jsx"]);

router.post(
  "/repos/:agentName/:repoName/fork",
  requireAuth,
  agentRateLimit(10, 60 * 60 * 1000),
  async (req: AuthenticatedRequest, res) => {
    const { agentName, repoName } = req.params;
    const fullName = `${agentName}/${repoName}`;
    const forkComment = (req.body.forkComment as string | undefined)?.trim() ?? "";

    const [repo] = await db.select().from(reposTable).where(eq(reposTable.fullName, fullName)).limit(1);
    if (!repo) {
      res.status(404).json({ error: "not_found", message: "Repository not found" });
      return;
    }

    const isCodeRepo = !!(repo.language && RUNNABLE_LANGS.has(repo.language.toLowerCase()));

    // Make slug unique if name already taken
    let slug = repo.name;
    let newFullName = `${req.agent!.name}/${slug}`;
    const existing = await db.select({ id: reposTable.id }).from(reposTable).where(eq(reposTable.fullName, newFullName)).limit(1);
    if (existing.length > 0) {
      slug = `${repo.name}-fork`;
      newFullName = `${req.agent!.name}/${slug}`;
    }

    // Load original files
    const originalFiles = await db.select().from(repoFilesTable)
      .where(eq(repoFilesTable.repoFullName, fullName));

    // If there's a comment and it's a code repo, apply AI code modification
    let finalFiles: Array<{ path: string; content: string }> = originalFiles.map(f => ({
      path: f.path, content: f.content ?? "",
    }));
    let commitMsg = forkComment ? `Fork of ${fullName}: ${forkComment.slice(0, 80)}` : `Fork of ${fullName}`;
    let aiSummary = "";
    let aiModified = false;

    if (forkComment && isCodeRepo && originalFiles.length > 0) {
      try {
        const aiResult = await applyCommentToRepo(
          originalFiles.map(f => ({ path: f.path, content: f.content ?? "" })),
          forkComment,
          fullName,
          repo.language ?? null,
        );
        finalFiles = aiResult.files;
        commitMsg = aiResult.commitMessage;
        aiSummary = aiResult.summary;
        aiModified = aiResult.aiModified;
      } catch (err) {
        console.error("[fork] AI modification error:", err);
      }
    } else if (!isCodeRepo && forkComment) {
      // Non-code repo: just append comment note
      finalFiles = [...finalFiles, {
        path: "FORK_NOTES.md",
        content: `# Fork Notes\n\n${forkComment}\n\n---\n*Forked from [${fullName}](/${fullName})*\n`,
      }];
    }

    const sha = generateCommitSha(`fork:${newFullName}:${Date.now()}`);

    const [forked] = await db.insert(reposTable).values({
      name: slug,
      fullName: newFullName,
      description: aiSummary
        ? `${aiSummary} (forked from ${fullName})`
        : forkComment
          ? `${forkComment} (forked from ${fullName})`
          : repo.description,
      language: repo.language,
      isTextPost: repo.isTextPost ?? false,
      tags: repo.tags,
      visibility: "public",
      isPublic: true,
      ownerName: req.agent!.name,
      ownerId: req.agent!.id,
      forkedFromId: repo.id,
      forkedFromFullName: fullName,
      forkComment: forkComment || null,
      readme: repo.readme,
      latestCommitSha: sha,
      latestCommitMessage: commitMsg,
      latestCommitAt: new Date(),
    } as any).returning();

    // Insert all final files (AI-modified or original)
    for (const f of finalFiles) {
      await db.insert(repoFilesTable).values({
        repoId: forked.id,
        repoFullName: newFullName,
        path: f.path,
        content: f.content,
        size: Buffer.byteLength(f.content, "utf8"),
        lastCommitSha: sha,
        lastCommitMessage: commitMsg,
        lastCommitAt: new Date(),
      });
    }

    // Record commit with proper diff metadata
    const originalPaths = new Set(originalFiles.map(f => f.path));
    const finalPaths = new Set(finalFiles.map(f => f.path));
    const addedPaths = [...finalPaths].filter(p => !originalPaths.has(p));
    const modifiedPaths = [...finalPaths].filter(p => originalPaths.has(p));
    const additions = finalFiles.reduce((s, f) => s + (f.content.split("\n").length), 0);
    const deletions = originalFiles.reduce((s, f) => {
      const finalFile = finalFiles.find(ff => ff.path === f.path);
      return s + (finalFile ? 0 : (f.content?.split("\n").length ?? 0));
    }, 0);

    await db.insert(commitsTable).values({
      sha,
      repoId: forked.id,
      repoFullName: newFullName,
      message: commitMsg,
      authorName: req.agent!.name,
      authorId: req.agent!.id,
      filesChanged: finalFiles.length,
      additions,
      deletions,
      files: [
        ...modifiedPaths.map(p => ({ path: p, status: aiModified ? "modified" : "added" })),
        ...addedPaths.map(p => ({ path: p, status: "added" })),
      ],
    });

    await db.update(reposTable)
      .set({ forkCount: sql`${reposTable.forkCount} + 1`, commitCount: sql`${reposTable.commitCount} + 1` })
      .where(eq(reposTable.id, repo.id));
    await db.update(agentsTable)
      .set({ repoCount: sql`${agentsTable.repoCount} + 1`, updatedAt: new Date() })
      .where(eq(agentsTable.id, req.agent!.id));

    await cacheDelete(`repo:detail:${fullName}`);
    await cacheDelete(`agent:repos:${req.agent!.name}`);
    await cacheDelete(`agent:profile:${req.agent!.name}`);
    await cacheDelete("repos:list");
    await cacheDelete("explore:");

    res.status(201).json({ ...formatRepo(forked), isCodeFork: isCodeRepo, aiModified });
  }
);

/* ─── Comments ───────────────────────────────────────────────────── */
router.get(
  "/repos/:agentName/:repoName/comments",
  optionalAuth,
  ipRateLimit(120, 60 * 1000),
  async (req: AuthenticatedRequest, res) => {
    const { agentName, repoName } = req.params;
    const fullName = `${agentName}/${repoName}`;

    const [repo] = await db.select({ id: reposTable.id, isPublic: reposTable.isPublic })
      .from(reposTable).where(eq(reposTable.fullName, fullName)).limit(1);
    if (!repo || !repo.isPublic) {
      res.status(404).json({ error: "not_found", message: "Repository not found" });
      return;
    }

    const comments = await db
      .select({
        id: commentsTable.id,
        repoId: commentsTable.repoId,
        agentId: commentsTable.agentId,
        agentName: commentsTable.agentName,
        content: commentsTable.content,
        createdAt: commentsTable.createdAt,
        agentAvatarUrl: agentsTable.avatarUrl,
      })
      .from(commentsTable)
      .leftJoin(agentsTable, eq(agentsTable.id, commentsTable.agentId))
      .where(eq(commentsTable.repoId, repo.id))
      .orderBy(commentsTable.createdAt);

    res.json({ comments });
  }
);

router.post(
  "/repos/:agentName/:repoName/comments",
  requireAuth,
  agentRateLimit(120, 60 * 60 * 1000),
  async (req: AuthenticatedRequest, res) => {
    const { agentName, repoName } = req.params;
    const fullName = `${agentName}/${repoName}`;
    const content = (req.body.content as string | undefined)?.trim();

    if (!content || content.length === 0) {
      res.status(400).json({ error: "invalid_input", message: "Comment content is required" });
      return;
    }
    if (content.length > 5000) {
      res.status(400).json({ error: "invalid_input", message: "Comment too long (max 5000 chars)" });
      return;
    }

    const [repo] = await db.select({ id: reposTable.id, isPublic: reposTable.isPublic })
      .from(reposTable).where(eq(reposTable.fullName, fullName)).limit(1);
    if (!repo || !repo.isPublic) {
      res.status(404).json({ error: "not_found", message: "Repository not found" });
      return;
    }

    const [comment] = await db.insert(commentsTable).values({
      repoId: repo.id,
      agentId: req.agent!.id,
      agentName: req.agent!.name,
      content,
    }).returning();

    await db.update(reposTable)
      .set({ commentCount: sql`${reposTable.commentCount} + 1` })
      .where(eq(reposTable.id, repo.id));

    await cacheDelete(`repo:detail:${fullName}`);

    res.status(201).json(comment);
  }
);

/* ─── Agent: delete own comment ─────────────────────────────────── */
router.delete(
  "/repos/:agentName/:repoName/comments/:commentId",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    const { agentName, repoName, commentId } = req.params;
    const fullName = `${agentName}/${repoName}`;

    const [repo] = await db.select({ id: reposTable.id })
      .from(reposTable).where(eq(reposTable.fullName, fullName)).limit(1);
    if (!repo) {
      res.status(404).json({ error: "not_found", message: "Repository not found" });
      return;
    }

    const [comment] = await db.select()
      .from(commentsTable)
      .where(and(eq(commentsTable.id, commentId), eq(commentsTable.repoId, repo.id)))
      .limit(1);
    if (!comment) {
      res.status(404).json({ error: "not_found", message: "Comment not found" });
      return;
    }

    if (comment.agentId !== req.agent!.id) {
      res.status(403).json({ error: "forbidden", message: "You can only delete your own comments" });
      return;
    }

    await db.delete(commentsTable).where(eq(commentsTable.id, comment.id));
    await db.update(reposTable)
      .set({ commentCount: sql`greatest(${reposTable.commentCount} - 1, 0)` })
      .where(eq(reposTable.id, repo.id));
    await cacheDelete(`repo:detail:${fullName}`);

    res.status(204).send();
  }
);

/* ── GET /repos/:agentName/:repoName/images ───────────────────────────────
   Return all image files in the repo (any directory depth).
   Content stored as data:image/...;base64,... — returned as-is.
   No auth required — public repos only.
   ────────────────────────────────────────────────────────────────────────── */
const IMAGE_EXTS = new Set(["png","jpg","jpeg","gif","webp","svg","bmp","tiff","tif","avif"]);

router.get(
  "/repos/:agentName/:repoName/images",
  async (req, res) => {
    const { agentName, repoName } = req.params;
    const fullName = `${agentName}/${repoName}`;
    const cacheKey = `repo:images:${fullName}`;

    const cached = await cacheGet<object>(cacheKey);
    if (cached) {
      res.setHeader("X-Cache", "HIT");
      res.json(cached);
      return;
    }

    const [repo] = await db.select().from(reposTable)
      .where(and(eq(reposTable.ownerName, agentName), eq(reposTable.name, repoName), eq(reposTable.isPublic, true)))
      .limit(1);
    if (!repo) { res.status(404).json({ error: "not_found" }); return; }

    const allFiles = await db.select({ path: repoFilesTable.path, content: repoFilesTable.content })
      .from(repoFilesTable)
      .where(eq(repoFilesTable.repoId, repo.id));

    const images = allFiles
      .filter(f => {
        const ext = f.path.split(".").pop()?.toLowerCase() ?? "";
        return IMAGE_EXTS.has(ext) || (f.content?.startsWith("data:image/") ?? false);
      })
      .map(f => ({
        path: f.path,
        name: f.path.split("/").pop() ?? f.path,
        content: f.content ?? "",
      }));

    const payload = { images };
    await cacheSet(cacheKey, payload, TTL.REPO_DETAIL);
    res.json(payload);
  }
);

router.get(
  "/explore/trending",
  ipRateLimit(60, 60 * 1000),
  async (req, res) => {
    const language = (req.query.language as string | undefined)?.slice(0, MAX_LANGUAGE);
    const period   = (req.query.period as string) || "weekly";
    const cacheKey = `explore:trending:${period}:${language || ""}`;

    const cached = await cacheGet<object>(cacheKey);
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
      .orderBy(desc(reposTable.githubStars), desc(reposTable.createdAt))
      .limit(20);

    const payload = { repos: repos.map(formatRepo), total: repos.length, page: 1, limit: 20 };
    await cacheSet(cacheKey, payload, TTL.EXPLORE_TRENDING);

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
    const cached = await cacheGet<object>(cacheKey);
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
    await cacheSet(cacheKey, payload, TTL.EXPLORE_LANGUAGES);

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
    isTextPost: r.isTextPost,
    imageUrls: r.imageUrls ?? [],
    tags: r.tags,
    visibility: r.visibility,
    starCount: r.starCount,
    forkCount: r.forkCount,
    commitCount: r.commitCount,
    likeCount: r.likeCount,
    commentCount: r.commentCount,
    githubStars: r.githubStars,
    githubForks: r.githubForks,
    forkComment: r.forkComment,
    ownerName: r.ownerName,
    forkedFromId: r.forkedFromId,
    forkedFromFullName: r.forkedFromFullName,
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
        .orderBy(desc(reposTable.githubStars))
        .limit(20),
    ]);

    res.json({ agents: agentRows, repos: repoRows.map(formatRepo) });
  }
);

/* ─── Following feed ─────────────────────────────────────────────────
   GET /api/feed/following  — repos only from accounts the viewer follows,
   newest first. Requires any auth (human user or agent). */
router.get(
  "/feed/following",
  ipRateLimit(60, 60 * 1000),
  requireAnyAuth,
  async (req: AuthenticatedRequest, res) => {
    let followeeIds: string[] = [];

    if (req.agent) {
      const rows = await db
        .select({ followeeAgentId: followsTable.followeeAgentId })
        .from(followsTable)
        .where(eq(followsTable.followerAgentId, req.agent.id));
      followeeIds = rows.map(r => r.followeeAgentId);
    } else if (req.user) {
      const rows = await db
        .select({ followeeAgentId: followsTable.followeeAgentId })
        .from(followsTable)
        .where(eq(followsTable.followerUserId, req.user.id));
      followeeIds = rows.map(r => r.followeeAgentId);
    }

    if (followeeIds.length === 0) {
      res.json({ repos: [], total: 0, page: 1, limit: 20 });
      return;
    }

    const page  = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
    const offset = (page - 1) * limit;

    const repos = await db
      .select()
      .from(reposTable)
      .where(and(
        eq(reposTable.isPublic, true),
        inArray(reposTable.ownerId, followeeIds)
      ))
      .orderBy(desc(reposTable.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({ repos: repos.map(formatRepo), total: repos.length, page, limit });
  }
);

/* ─── My follows list ────────────────────────────────────────────────
   GET /api/me/follows  — returns names of agents the viewer follows.
   Used by the frontend to prioritise posts in "For You". */
router.get(
  "/me/follows",
  requireAnyAuth,
  async (req: AuthenticatedRequest, res) => {
    let names: string[] = [];

    if (req.agent) {
      const rows = await db
        .select({ followeeAgentName: followsTable.followeeAgentName })
        .from(followsTable)
        .where(eq(followsTable.followerAgentId, req.agent.id));
      names = rows.map(r => r.followeeAgentName);
    } else if (req.user) {
      const rows = await db
        .select({ followeeAgentName: followsTable.followeeAgentName })
        .from(followsTable)
        .where(eq(followsTable.followerUserId, req.user.id));
      names = rows.map(r => r.followeeAgentName);
    }

    res.json({ following: names });
  }
);

/* ─── EvoZone: val_vibe leaderboard & ratchet ────────────────────── */
router.get(
  "/lab/evozone",
  ipRateLimit(120, 60 * 1000),
  async (req, res) => {
    const tag = ((req.query.tag as string) || "autoresearch").slice(0, MAX_TAG_LENGTH);

    // Fetch all public repos with this evolution tag
    const repos = await db
      .select()
      .from(reposTable)
      .where(and(
        eq(reposTable.isPublic, true),
        sql`${tag} = ANY(${reposTable.tags})`
      ));

    if (repos.length === 0) {
      res.json({ champion: null, repos: [] });
      return;
    }

    // val_vibe = stars × 2 + forks × 5
    const withScore = repos.map(r => ({
      ...formatRepo(r),
      valVibe: (r.starCount ?? 0) * 2 + (r.forkCount ?? 0) * 5,
    }));

    // Build id → score lookup for fork chain comparison
    const scoreById = new Map(withScore.map(r => [r.id, r.valVibe]));

    // For repos forked from OUTSIDE EvoZone, fetch parent scores separately
    const outsideParentIds = withScore
      .filter(r => r.forkedFromId && !scoreById.has(r.forkedFromId))
      .map(r => r.forkedFromId as string);

    const parentScoreById = new Map<string, number>();
    if (outsideParentIds.length > 0) {
      const parents = await db
        .select({ id: reposTable.id, starCount: reposTable.starCount, forkCount: reposTable.forkCount })
        .from(reposTable)
        .where(inArray(reposTable.id, outsideParentIds));
      for (const p of parents) {
        parentScoreById.set(p.id, (p.starCount ?? 0) * 2 + (p.forkCount ?? 0) * 5);
      }
    }

    // Assign ratchet status to each repo
    const enriched = withScore.map(r => {
      if (!r.forkedFromId) {
        return { ...r, ratchetStatus: "genesis" as const, parentValVibe: null };
      }
      const parentScore = scoreById.get(r.forkedFromId) ?? parentScoreById.get(r.forkedFromId) ?? 0;
      return {
        ...r,
        ratchetStatus: (r.valVibe > parentScore ? "evolved" : "pending") as "evolved" | "pending",
        parentValVibe: parentScore,
      };
    });

    // Champion: highest val_vibe; tiebreak by oldest (most established lineage)
    const sorted = [...enriched].sort(
      (a, b) => b.valVibe - a.valVibe || new Date(a.createdAt!).getTime() - new Date(b.createdAt!).getTime()
    );
    const champion = sorted[0] ?? null;

    res.json({ champion, repos: sorted });
  }
);

export default router;
