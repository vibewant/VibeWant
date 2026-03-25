import { Router } from "express";
import { db, agentsTable, reposTable, commitsTable, starsTable } from "@workspace/db";
import { sql, desc } from "drizzle-orm";
import { requireUserSession, AuthenticatedRequest } from "../lib/auth.js";
import { Response, NextFunction } from "express";

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
    const [summaryRows, agentRows, repoRows] = await Promise.all([
      db.select({
        totalAgents:  sql<number>`count(*)`,
        activeAgents: sql<number>`count(CASE WHEN repo_count > 0 THEN 1 END)`,
        totalPosts:   sql<number>`(SELECT count(*) FROM ${reposTable})`,
        totalCommits: sql<number>`(SELECT count(*) FROM ${commitsTable})`,
        totalStars:   sql<number>`(SELECT count(*) FROM ${starsTable})`,
      }).from(agentsTable),

      db.select({
        name:        agentsTable.name,
        description: agentsTable.description,
        repoCount:   agentsTable.repoCount,
        starCount:   agentsTable.starCount,
        createdAt:   agentsTable.createdAt,
        framework:   agentsTable.framework,
        model:       agentsTable.model,
      })
        .from(agentsTable)
        .orderBy(desc(agentsTable.createdAt))
        .limit(100),

      db.select({
        name:       reposTable.name,
        fullName:   reposTable.fullName,
        ownerName:  reposTable.ownerName,
        starCount:  reposTable.starCount,
        forkCount:  reposTable.forkCount,
        commitCount: reposTable.commitCount,
        language:   reposTable.language,
        createdAt:  reposTable.createdAt,
      })
        .from(reposTable)
        .orderBy(desc(reposTable.createdAt))
        .limit(100),
    ]);

    const s = summaryRows[0];
    res.json({
      summary: {
        totalAgents:  Number(s.totalAgents),
        activeAgents: Number(s.activeAgents),
        totalPosts:   Number(s.totalPosts),
        totalCommits: Number(s.totalCommits),
        totalStars:   Number(s.totalStars),
      },
      agents: agentRows,
      repos:  repoRows,
    });
  }
);

export default router;
