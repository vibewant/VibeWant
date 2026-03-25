import { Router } from "express";
import { Sandbox } from "@e2b/code-interpreter";
import { db, reposTable, repoFilesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, AuthenticatedRequest } from "../lib/auth.js";
import { ipRateLimit } from "../lib/rateLimit.js";

const router = Router();

const SUPPORTED_LANGUAGES: Record<string, string> = {
  python: "python",
  python3: "python",
  py: "python",
  javascript: "js",
  js: "js",
  typescript: "js",
  ts: "js",
  node: "js",
  nodejs: "js",
};

const LANGUAGE_TIMEOUT_MS = 30_000;
const MAX_CODE_LENGTH = 100_000;

router.post(
  "/repos/:agentName/:repoName/run",
  requireAuth,
  ipRateLimit(10, 60 * 1000),
  async (req: AuthenticatedRequest, res) => {
    const { agentName, repoName } = req.params;
    const fullName = `${agentName}/${repoName}`;

    const code = req.body.code as string | undefined;
    const language = (req.body.language as string | undefined)?.toLowerCase();
    const filePath = req.body.filePath as string | undefined;

    if (!process.env.E2B_API_KEY) {
      res.status(503).json({
        error: "sandbox_unavailable",
        message: "Sandbox execution is not configured on this server.",
      });
      return;
    }

    const [repo] = await db
      .select()
      .from(reposTable)
      .where(eq(reposTable.fullName, fullName))
      .limit(1);

    if (!repo || !repo.isPublic) {
      res.status(404).json({ error: "not_found", message: "Repository not found." });
      return;
    }

    let codeToRun = code;
    let detectedLanguage = language;

    if (!codeToRun && filePath) {
      const cleanPath = filePath.replace(/\.\.\//g, "").replace(/^\/+/, "");

      const [file] = await db
        .select()
        .from(repoFilesTable)
        .where(and(eq(repoFilesTable.repoFullName, fullName), eq(repoFilesTable.path, cleanPath)))
        .limit(1);

      if (!file) {
        res.status(404).json({ error: "not_found", message: "File not found." });
        return;
      }

      codeToRun = file.content ?? undefined;

      const ext = cleanPath.split(".").pop()?.toLowerCase() ?? "";
      detectedLanguage = SUPPORTED_LANGUAGES[ext] || detectedLanguage;
    }

    if (!codeToRun || codeToRun.trim().length === 0) {
      res.status(400).json({ error: "invalid_input", message: "No code provided to execute." });
      return;
    }

    if (codeToRun.length > MAX_CODE_LENGTH) {
      res.status(400).json({
        error: "invalid_input",
        message: `Code exceeds maximum length of ${MAX_CODE_LENGTH} characters.`,
      });
      return;
    }

    const kernelLang = detectedLanguage
      ? SUPPORTED_LANGUAGES[detectedLanguage] ?? "python"
      : "python";

    const unsupportedLang = detectedLanguage && !SUPPORTED_LANGUAGES[detectedLanguage];
    if (unsupportedLang) {
      res.status(422).json({
        error: "unsupported_language",
        message: `Language "${detectedLanguage}" is not supported. Supported: Python, JavaScript/TypeScript.`,
      });
      return;
    }

    let sandbox: Sandbox | null = null;
    try {
      sandbox = await Sandbox.create({
        apiKey: process.env.E2B_API_KEY,
        timeoutMs: LANGUAGE_TIMEOUT_MS,
      });

      const execution = await sandbox.runCode(codeToRun, { language: kernelLang });

      const results: any[] = (execution.results ?? []).map((r: any) => ({
        type: r.type ?? "text",
        text: r.text ?? null,
        png: r.png ?? null,
        html: r.html ?? null,
        markdown: r.markdown ?? null,
      }));

      res.json({
        success: !execution.error,
        stdout: execution.logs?.stdout?.join("") ?? "",
        stderr: execution.logs?.stderr?.join("") ?? "",
        error: execution.error
          ? {
              name: execution.error.name,
              value: execution.error.value,
              traceback: execution.error.traceback,
            }
          : null,
        results,
        language: kernelLang,
      });
    } catch (err: any) {
      const msg = err?.message ?? "Unknown sandbox error";
      if (msg.includes("timeout") || msg.includes("Timeout")) {
        res.status(408).json({ error: "timeout", message: "Code execution timed out (30s limit)." });
      } else {
        res.status(500).json({ error: "sandbox_error", message: msg });
      }
    } finally {
      if (sandbox) {
        try { await sandbox.kill(); } catch {}
      }
    }
  }
);

export default router;
