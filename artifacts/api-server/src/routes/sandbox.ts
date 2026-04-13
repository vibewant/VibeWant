import { Router } from "express";
import { Sandbox } from "@e2b/code-interpreter";
import { db, reposTable, repoFilesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAnyAuth, AuthenticatedRequest } from "../lib/auth.js";
import { ipRateLimit } from "../lib/rateLimit.js";

const router = Router();

const RUNNABLE_EXTENSIONS = new Set(["ts", "tsx", "js", "jsx", "mjs", "cjs", "py", "py3"]);
const SANDBOX_TIMEOUT_MS = 120_000;
const EXEC_TIMEOUT_S = 30;
const INSTALL_TIMEOUT_S = 90;
const MAX_FILES = 60;

function buildOrchestrationCode(
  files: { path: string; content: string | null }[],
  entryFilePath: string,
  hasPackageJson: boolean,
  hasRequirements: boolean,
): string {
  const ext = entryFilePath.split(".").pop()?.toLowerCase() ?? "";

  // Write every file via base64 to avoid any string-escaping issues
  const fileLines = files
    .filter((f) => f.content !== null)
    .slice(0, MAX_FILES)
    .map((f) => {
      const b64 = Buffer.from(f.content ?? "", "utf8").toString("base64");
      const dir = f.path.includes("/") ? f.path.split("/").slice(0, -1).join("/") : "";
      const mkdirLine = dir ? `os.makedirs('/tmp/repo/${dir}', exist_ok=True)\n` : "";
      return `${mkdirLine}open('/tmp/repo/${f.path}', 'wb').write(base64.b64decode('${b64}'))`;
    })
    .join("\n");

  let installCode = "";
  if (hasPackageJson) {
    installCode = `
print('[sandbox] Installing npm packages...')
_ir = subprocess.run(
    ['npm', 'install', '--prefer-offline', '--no-audit', '--no-fund'],
    cwd='/tmp/repo', capture_output=True, text=True, timeout=${INSTALL_TIMEOUT_S}
)
if _ir.returncode != 0:
    print('[npm install] Warning:', _ir.stderr[:800])
else:
    print('[sandbox] npm install done.')
`;
  } else if (hasRequirements) {
    installCode = `
print('[sandbox] Installing pip packages (prefer binary wheels)...')
_ir = subprocess.run(
    [sys.executable, '-m', 'pip', 'install', '-q', '--prefer-binary', '-r', '/tmp/repo/requirements.txt'],
    cwd='/tmp/repo', capture_output=True, text=True, timeout=${INSTALL_TIMEOUT_S}
)
if _ir.returncode != 0:
    _pip_err = (_ir.stderr or _ir.stdout or '').strip()
    # Extract which package(s) failed for a helpful message
    _failed = [l.split(":")[-1].strip() for l in _pip_err.splitlines() if 'error' in l.lower() and 'could not' in l.lower()]
    _hint = (', '.join(_failed[:3]) + ' ') if _failed else ''
    raise RuntimeError(
        f'pip install failed: {_hint}Some packages require native compilation (C/Fortran extensions) '
        f'and cannot be installed automatically in the sandbox.\\n\\n'
        f'Packages like pynbody, healpy, or other scientific libraries with compiled extensions '
        f'need a pre-configured environment. Consider using pure-Python alternatives, '
        f'or mock the data-loading layer to make the code runnable in the sandbox.\\n\\n'
        f'pip error output:\\n{_pip_err[:600]}'
    )
else:
    print('[sandbox] pip install done.')
`;
  }

  let runCmd: string;
  if (["ts", "tsx"].includes(ext)) {
    runCmd = `['npx', '--yes', 'tsx', '/tmp/repo/${entryFilePath}']`;
  } else if (["js", "mjs", "cjs", "jsx"].includes(ext)) {
    runCmd = `['node', '/tmp/repo/${entryFilePath}']`;
  } else {
    // Python / fallback
    runCmd = `[sys.executable, '/tmp/repo/${entryFilePath}']`;
  }

  return `
import os, sys, subprocess, base64
os.makedirs('/tmp/repo', exist_ok=True)
${fileLines}
${installCode}
print('[sandbox] Running ${entryFilePath}...')
_rr = subprocess.run(
    ${runCmd},
    cwd='/tmp/repo', capture_output=True, text=True, timeout=${EXEC_TIMEOUT_S}
)
_out = (_rr.stdout or '').strip()
_err = (_rr.stderr or '').strip()
if _out:
    print(_out)
if _err:
    print(_err, file=sys.stderr)
if _rr.returncode not in (0, None):
    raise RuntimeError(f'Process exited with code {_rr.returncode}')
`.trim();
}

router.post(
  "/repos/:agentName/:repoName/run",
  requireAnyAuth,
  ipRateLimit(10, 60 * 1000),
  async (req: AuthenticatedRequest, res) => {
    const { agentName, repoName } = req.params;
    const fullName = `${agentName}/${repoName}`;

    const rawCode = req.body.code as string | undefined;
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

    let sandbox: Sandbox | null = null;
    try {
      sandbox = await Sandbox.create({
        apiKey: process.env.E2B_API_KEY,
        timeoutMs: SANDBOX_TIMEOUT_MS,
      });

      // ── Path A: raw code snippet (legacy / direct paste) ──────────────────
      if (rawCode && rawCode.trim().length > 0) {
        const SUPPORTED: Record<string, string> = {
          python: "python", python3: "python", py: "python",
          javascript: "js", js: "js", typescript: "js", ts: "js", node: "js", nodejs: "js",
        };
        const kernelLang = language ? SUPPORTED[language] ?? "python" : "python";
        const execution = await sandbox.runCode(rawCode, { language: kernelLang });
        const results = (execution.results ?? []).map((r: any) => ({
          type: r.type ?? "text", text: r.text ?? null,
          png: r.png ?? null, html: r.html ?? null, markdown: r.markdown ?? null,
        }));
        res.json({
          success: !execution.error,
          stdout: execution.logs?.stdout?.join("") ?? "",
          stderr: execution.logs?.stderr?.join("") ?? "",
          error: execution.error
            ? { name: execution.error.name, value: execution.error.value, traceback: execution.error.traceback }
            : null,
          results,
          language: kernelLang,
        });
        return;
      }

      // ── Path B: repo file execution (fetch all files, install deps, run) ──
      if (!filePath) {
        res.status(400).json({ error: "invalid_input", message: "No code or file path provided." });
        return;
      }

      const cleanPath = filePath.replace(/\.\.\//g, "").replace(/^\/+/, "");
      const ext = cleanPath.split(".").pop()?.toLowerCase() ?? "";

      if (!RUNNABLE_EXTENSIONS.has(ext)) {
        res.status(422).json({
          error: "unsupported_language",
          message: `File type ".${ext}" is not executable. Supported: .ts, .js, .py and variants.`,
        });
        return;
      }

      // Fetch all repo files from DB
      const allFiles = await db
        .select({ path: repoFilesTable.path, content: repoFilesTable.content })
        .from(repoFilesTable)
        .where(eq(repoFilesTable.repoFullName, fullName));

      if (allFiles.length === 0) {
        res.status(404).json({ error: "not_found", message: "No files found in this repository." });
        return;
      }

      const hasPackageJson = allFiles.some((f) => f.path === "package.json");
      const hasRequirements = allFiles.some((f) => f.path === "requirements.txt");

      const orchestrationCode = buildOrchestrationCode(
        allFiles,
        cleanPath,
        hasPackageJson,
        hasRequirements,
      );

      // Always orchestrate via the Python kernel (has subprocess, works for all langs)
      const execution = await sandbox.runCode(orchestrationCode, { language: "python" });

      res.json({
        success: !execution.error,
        stdout: execution.logs?.stdout?.join("") ?? "",
        stderr: execution.logs?.stderr?.join("") ?? "",
        error: execution.error
          ? { name: execution.error.name, value: execution.error.value, traceback: execution.error.traceback }
          : null,
        results: [],
        language: ["ts", "tsx"].includes(ext) ? "js" : (["py", "py3"].includes(ext) ? "python" : "js"),
      });
    } catch (err: any) {
      const msg = err?.message ?? "Unknown sandbox error";
      if (msg.includes("timeout") || msg.includes("Timeout")) {
        res.status(408).json({ error: "timeout", message: "Code execution timed out." });
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
