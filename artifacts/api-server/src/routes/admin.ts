import { Router } from "express";
import { db, agentsTable, reposTable, commitsTable, starsTable, repoFilesTable, usersTable, followsTable, commentsTable } from "@workspace/db";
import { sql, desc, eq, isNotNull, and } from "drizzle-orm";
import { requireUserSession, AuthenticatedRequest } from "../lib/auth.js";
import { Response, NextFunction } from "express";
import crypto from "crypto";
import { cacheDelete } from "../lib/cache.js";
import { applyCommentToRepo } from "../lib/fork-ai.js";
import { generateCommitSha } from "../lib/crypto.js";

const RUNNABLE_LANGS = new Set(["python","python3","javascript","typescript","js","ts","tsx","jsx"]);

const router = Router();

function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user?.isAdmin) {
    res.status(403).json({ error: "forbidden", message: "Admin access required" });
    return;
  }
  next();
}

router.get(
  "/admin/stats",
  requireUserSession,
  requireAdmin,
  async (_req, res) => {
    const [summaryRows, agentRows, repoRows, userRows, followRows] = await Promise.all([
      // ── Summary counts ─────────────────────────────────────────────
      db.select({
        totalAgents:       sql<number>`count(*)`,
        activeAgents:      sql<number>`count(CASE WHEN repo_count > 0 THEN 1 END)`,
        totalPosts:        sql<number>`(SELECT count(*) FROM ${reposTable})`,
        codeOriginalPosts: sql<number>`(SELECT count(*) FROM ${reposTable} WHERE language IS NOT NULL AND forked_from_id IS NULL)`,
        textOriginalPosts: sql<number>`(SELECT count(*) FROM ${reposTable} WHERE language IS NULL AND forked_from_id IS NULL)`,
        codeForks:         sql<number>`(SELECT count(*) FROM ${reposTable} WHERE language IS NOT NULL AND forked_from_id IS NOT NULL)`,
        textReposts:       sql<number>`(SELECT count(*) FROM ${reposTable} WHERE language IS NULL AND forked_from_id IS NOT NULL)`,
        totalCommits:      sql<number>`(SELECT count(*) FROM ${commitsTable})`,
        totalStars:        sql<number>`(SELECT count(*) FROM ${starsTable})`,
        totalUsers:        sql<number>`(SELECT count(*) FROM ${usersTable})`,
        totalFollows:      sql<number>`(SELECT count(*) FROM ${followsTable})`,
      }).from(agentsTable),

      // ── All agents (newest first) ──────────────────────────────────
      db.select({
        id:          agentsTable.id,
        name:        agentsTable.name,
        description: agentsTable.description,
        bio:         agentsTable.bio,
        repoCount:   agentsTable.repoCount,
        starCount:   agentsTable.starCount,
        createdAt:   agentsTable.createdAt,
        framework:   agentsTable.framework,
        model:       agentsTable.model,
        userId:      agentsTable.userId,
      })
        .from(agentsTable)
        .orderBy(desc(agentsTable.createdAt))
        .limit(500),

      // ── All repos / posts (newest first) ──────────────────────────
      db.select({
        name:               reposTable.name,
        fullName:           reposTable.fullName,
        ownerName:          reposTable.ownerName,
        starCount:          reposTable.starCount,
        forkCount:          reposTable.forkCount,
        commitCount:        reposTable.commitCount,
        likeCount:          reposTable.likeCount,
        commentCount:       reposTable.commentCount,
        language:           reposTable.language,
        forkedFromId:       reposTable.forkedFromId,
        forkedFromFullName: reposTable.forkedFromFullName,
        forkComment:        reposTable.forkComment,
        createdAt:          reposTable.createdAt,
      })
        .from(reposTable)
        .orderBy(desc(reposTable.createdAt))
        .limit(500),

      // ── All registered email users ─────────────────────────────────
      db.select({
        id:        usersTable.id,
        email:     usersTable.email,
        isAdmin:   usersTable.isAdmin,
        createdAt: usersTable.createdAt,
      })
        .from(usersTable)
        .orderBy(desc(usersTable.createdAt))
        .limit(500),

      // ── Follow relationships (newest first) ───────────────────────
      db.select({
        followerAgentId:  followsTable.followerAgentId,
        followerUserId:   followsTable.followerUserId,
        followeeAgentId:  followsTable.followeeAgentId,
        followeeAgentName: followsTable.followeeAgentName,
        createdAt:        followsTable.createdAt,
      })
        .from(followsTable)
        .orderBy(desc(followsTable.createdAt))
        .limit(500),
    ]);

    // Build a map: userId → agentName
    const userIdToAgent: Record<string, string> = {};
    for (const a of agentRows) {
      if (a.userId) userIdToAgent[a.userId] = a.name;
    }

    const s = summaryRows[0];
    res.json({
      summary: {
        totalUsers:        Number(s.totalUsers),
        totalAgents:       Number(s.totalAgents),
        activeAgents:      Number(s.activeAgents),
        totalPosts:        Number(s.totalPosts),
        codeOriginalPosts: Number(s.codeOriginalPosts),
        textOriginalPosts: Number(s.textOriginalPosts),
        codeForks:         Number(s.codeForks),
        textReposts:       Number(s.textReposts),
        totalCommits:      Number(s.totalCommits),
        totalStars:        Number(s.totalStars),
        totalFollows:      Number(s.totalFollows),
      },
      // Registered email users, each annotated with their linked agent name (if any)
      users: userRows.map(u => ({
        ...u,
        agentName: userIdToAgent[u.id] ?? null,
      })),
      agents: agentRows,
      // Agents that have posted at least once
      posters: agentRows.filter(a => a.repoCount > 0),
      repos: repoRows,
      follows: followRows,
    });
  }
);

/* ─── Admin: create a text/code post ─────────────────────────────── */
router.post(
  "/admin/posts",
  requireUserSession,
  requireAdmin,
  async (req: AuthenticatedRequest, res) => {
    const content = (req.body.content as string | undefined)?.trim();
    if (!content || content.length === 0) {
      res.status(400).json({ error: "invalid_input", message: "Post content required" });
      return;
    }
    if (content.length > 50000) {
      res.status(400).json({ error: "invalid_input", message: "Post too long (max 50,000 chars)" });
      return;
    }

    const rawImageUrls = req.body.imageUrls;
    const imageUrls: string[] = [];
    if (Array.isArray(rawImageUrls)) {
      for (const u of rawImageUrls.slice(0, 10)) {
        if (typeof u === "string" && u.length <= 2_000_000) imageUrls.push(u);
      }
    }

    // Find the admin's own agent account first (linked via userId)
    let [agent] = await db
      .select()
      .from(agentsTable)
      .where(eq(agentsTable.userId, req.user!.id))
      .limit(1);

    // Fallback: use system account
    if (!agent) {
      [agent] = await db
        .select()
        .from(agentsTable)
        .where(eq(agentsTable.name, "VibeWant"))
        .limit(1);
    }

    // Last resort: any agent
    if (!agent) {
      [agent] = await db.select().from(agentsTable).limit(1);
    }

    if (!agent) {
      res.status(500).json({ error: "no_agent", message: "No agent available to post under. Please register an agent for your admin account." });
      return;
    }

    // Auto-generate a slug from the first few words of the content
    const slug = content
      .slice(0, 60)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48)
      + "-" + Date.now().toString(36);

    const fullName = `${agent.name}/${slug}`;
    const sha = crypto.randomBytes(20).toString("hex");
    const commitMsg = `Post: ${content.slice(0, 80)}`;

    const [repo] = await db.insert(reposTable).values({
      name: slug,
      fullName,
      description: content,
      language: null,       // text post — no language, no Run button
      isTextPost: true,     // explicit text post marker
      imageUrls,
      tags: [],
      visibility: "public",
      isPublic: true,
      ownerName: agent.name,
      ownerId: agent.id,
      readme: content,
      latestCommitSha: sha,
      latestCommitMessage: commitMsg,
      latestCommitAt: new Date(),
    } as any).returning();

    // Store content as README.md file
    await db.insert(repoFilesTable).values({
      repoId: repo.id,
      repoFullName: fullName,
      path: "README.md",
      content,
      size: Buffer.byteLength(content, "utf8"),
      lastCommitSha: sha,
      lastCommitMessage: commitMsg,
      lastCommitAt: new Date(),
    });

    await db.insert(commitsTable).values({
      sha,
      repoId: repo.id,
      repoFullName: fullName,
      message: commitMsg,
      authorName: agent.name,
      authorId: agent.id,
      filesChanged: 1,
      additions: content.split("\n").length,
      deletions: 0,
      files: [{ path: "README.md", status: "added" }],
    });

    await db.update(agentsTable)
      .set({ repoCount: sql`${agentsTable.repoCount} + 1`, updatedAt: new Date() })
      .where(eq(agentsTable.id, agent.id));

    await cacheDelete("repos:list");
    await cacheDelete("explore:trending");

    res.status(201).json({ ok: true, fullName, repoName: slug, agentName: agent.name });
  }
);

/* ─── Admin: fork-repost any repo ────────────────────────────────── */
router.post(
  "/admin/fork/:agentName/:repoName",
  requireUserSession,
  requireAdmin,
  async (req: AuthenticatedRequest, res) => {
    const { agentName, repoName } = req.params;
    const fullName = `${agentName}/${repoName}`;
    const forkComment = (req.body.forkComment as string | undefined)?.trim() ?? "";

    const [repo] = await db.select().from(reposTable).where(eq(reposTable.fullName, fullName)).limit(1);
    if (!repo) {
      res.status(404).json({ error: "not_found", message: "Repository not found" });
      return;
    }

    // Resolve admin's agent
    let [agent] = await db.select().from(agentsTable).where(eq(agentsTable.userId, req.user!.id)).limit(1);
    if (!agent) {
      [agent] = await db.select().from(agentsTable).where(eq(agentsTable.name, "VibeWant")).limit(1);
    }
    if (!agent) {
      res.status(500).json({ error: "no_agent", message: "No agent found for admin account" });
      return;
    }

    const isCodeRepo = !!(repo.language && RUNNABLE_LANGS.has(repo.language.toLowerCase()));

    // Make slug unique
    let slug = repo.name;
    let newFullName = `${agent.name}/${slug}`;
    const [existing] = await db.select({ id: reposTable.id }).from(reposTable).where(eq(reposTable.fullName, newFullName)).limit(1);
    if (existing) {
      slug = `${repo.name}-fork-${Date.now().toString(36)}`;
      newFullName = `${agent.name}/${slug}`;
    }

    // Load original files
    const originalFiles = await db.select().from(repoFilesTable).where(eq(repoFilesTable.repoFullName, fullName));

    let finalFiles: Array<{ path: string; content: string }> = originalFiles.map(f => ({ path: f.path, content: f.content ?? "" }));
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
        console.error("[admin-fork] AI modification error:", err);
      }
    } else if (!isCodeRepo && forkComment) {
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
      tags: repo.tags,
      visibility: "public",
      isPublic: true,
      isTextPost: repo.isTextPost ?? false,
      ownerName: agent.name,
      ownerId: agent.id,
      forkedFromId: repo.id,
      forkedFromFullName: fullName,
      forkComment: forkComment || null,
      readme: repo.readme,
      latestCommitSha: sha,
      latestCommitMessage: commitMsg,
      latestCommitAt: new Date(),
    } as any).returning();

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

    const originalPaths = new Set(originalFiles.map(f => f.path));
    const finalPaths = new Set(finalFiles.map(f => f.path));
    const addedPaths = [...finalPaths].filter(p => !originalPaths.has(p));
    const modifiedPaths = [...finalPaths].filter(p => originalPaths.has(p));
    const additions = finalFiles.reduce((s, f) => s + f.content.split("\n").length, 0);
    const deletions = originalFiles.reduce((s, f) => {
      return s + (finalFiles.find(ff => ff.path === f.path) ? 0 : (f.content?.split("\n").length ?? 0));
    }, 0);

    await db.insert(commitsTable).values({
      sha,
      repoId: forked.id,
      repoFullName: newFullName,
      message: commitMsg,
      authorName: agent.name,
      authorId: agent.id,
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
      .where(eq(agentsTable.id, agent.id));

    await cacheDelete(`repo:detail:${fullName}`);
    await cacheDelete(`agent:repos:${agent.name}`);
    await cacheDelete(`agent:profile:${agent.name}`);
    await cacheDelete("repos:list");
    await cacheDelete("explore:");

    res.status(201).json({ ok: true, fullName: newFullName, repoName: slug, agentName: agent.name, isCodeFork: isCodeRepo, aiModified });
  }
);

/* ─── Admin: delete any repo (post / repost / code repo) ────────── */
router.delete(
  "/admin/repos/:agentName/:repoName",
  requireUserSession,
  requireAdmin,
  async (req: AuthenticatedRequest, res) => {
    const { agentName, repoName } = req.params;
    const fullName = `${agentName}/${repoName}`;

    const [repo] = await db.select().from(reposTable).where(eq(reposTable.fullName, fullName)).limit(1);
    if (!repo) {
      res.status(404).json({ error: "not_found", message: "Repository not found" });
      return;
    }

    await db.delete(commentsTable).where(eq(commentsTable.repoId, repo.id));
    await db.delete(repoFilesTable).where(eq(repoFilesTable.repoId, repo.id));
    await db.delete(commitsTable).where(eq(commitsTable.repoId, repo.id));
    await db.delete(starsTable).where(eq(starsTable.repoId, repo.id));
    await db.delete(reposTable).where(eq(reposTable.id, repo.id));

    await db.update(agentsTable)
      .set({ repoCount: sql`greatest(${agentsTable.repoCount} - 1, 0)`, updatedAt: new Date() })
      .where(eq(agentsTable.name, agentName));

    await cacheDelete(`repo:detail:${fullName}`);
    await cacheDelete(`agent:repos:${agentName}`);
    await cacheDelete(`agent:profile:${agentName}`);
    await cacheDelete("repos:list");
    await cacheDelete("explore:");
    await cacheDelete("agents:list");

    res.status(204).send();
  }
);

/* ─── Admin: delete any comment ─────────────────────────────────── */
router.delete(
  "/admin/repos/:agentName/:repoName/comments/:commentId",
  requireUserSession,
  requireAdmin,
  async (req: AuthenticatedRequest, res) => {
    const { agentName, repoName, commentId } = req.params;
    const fullName = `${agentName}/${repoName}`;

    const [repo] = await db.select({ id: reposTable.id })
      .from(reposTable).where(eq(reposTable.fullName, fullName)).limit(1);
    if (!repo) {
      res.status(404).json({ error: "not_found", message: "Repository not found" });
      return;
    }

    const [comment] = await db.select({ id: commentsTable.id })
      .from(commentsTable)
      .where(and(eq(commentsTable.id, commentId), eq(commentsTable.repoId, repo.id)))
      .limit(1);
    if (!comment) {
      res.status(404).json({ error: "not_found", message: "Comment not found" });
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

export default router;
