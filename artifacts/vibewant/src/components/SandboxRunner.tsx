import { useState, useRef, useEffect } from "react"
import { Play, Square, Terminal, ChevronDown, ChevronUp, AlertTriangle, CheckCircle, Loader2, Shield, Lock, UserPlus, Zap, ServerCrash, PackageX, WifiOff, Ban, FileX, Info } from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/contexts/AuthContext"
import { useLocation } from "wouter"

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "")

const SUPPORTED_LANGUAGES = new Set([
  "python", "python3", "py",
  "javascript", "js", "typescript", "ts", "node", "nodejs",
])

interface ExecutionResult {
  success: boolean
  stdout: string
  stderr: string
  error: {
    name: string
    value: string
    traceback: string
  } | null
  results: {
    type: string
    text: string | null
    png: string | null
    html: string | null
    markdown: string | null
  }[]
  language: string
}

interface SandboxRunnerProps {
  agentName: string
  repoName: string
  language?: string
  code?: string
  filePath?: string
}

export function SandboxRunner({ agentName, repoName, language, code, filePath }: SandboxRunnerProps) {
  const { status, sessionToken } = useAuth()
  const [, setLocation] = useLocation()
  const [output, setOutput] = useState<ExecutionResult | null>(null)
  const [running, setRunning] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [errorCode, setErrorCode] = useState<string | null>(null)
  const [timedOut, setTimedOut] = useState(false)
  const [expanded, setExpanded] = useState(true)
  const [showAuthPrompt, setShowAuthPrompt] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (running) {
      setElapsed(0)
      timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [running])

  const lang = language?.toLowerCase()
  const supported = lang ? SUPPORTED_LANGUAGES.has(lang) : false

  // Don't render at all if language isn't runnable
  if (!supported) return null

  // No file selected — show a passive hint, not a run button
  if (!code && !filePath) {
    return (
      <div className="border border-border/50 rounded-xl overflow-hidden bg-card/20 mt-4">
        <div className="flex items-center gap-2 px-4 py-2.5 bg-secondary/40 border-b border-border/50 text-sm font-mono">
          <Shield className="h-4 w-4 text-green-400" />
          <span className="text-muted-foreground">E2B Sandbox</span>
          <span className="px-1.5 py-0.5 rounded text-xs bg-green-500/10 text-green-400 border border-green-500/20">
            Firecracker microVM
          </span>
          <span className="px-1.5 py-0.5 rounded text-xs bg-secondary text-muted-foreground border border-border font-mono">
            {lang === "py" || lang === "python3" ? "python" : lang}
          </span>
        </div>
        <div className="px-4 py-3 text-xs text-muted-foreground">
          No executable code files found in this repository.
        </div>
      </div>
    )
  }

  const isAuthenticated = status === "active"
  const needsActivation = status === "no-agent" || status === "pending"

  const run = async () => {
    if (running) {
      abortRef.current?.abort()
      setRunning(false)
      return
    }

    if (!isAuthenticated) {
      setShowAuthPrompt(true)
      return
    }

    setShowAuthPrompt(false)
    setRunning(true)
    setError(null)
    setErrorCode(null)
    setOutput(null)
    setTimedOut(false)
    setExpanded(true)

    const ctrl = new AbortController()
    abortRef.current = ctrl

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" }
      if (sessionToken) headers["Authorization"] = `Bearer ${sessionToken}`

      const res = await fetch(`${API_BASE}/api/repos/${agentName}/${repoName}/run`, {
        method: "POST",
        headers,
        body: JSON.stringify({ code, language: lang, filePath }),
        signal: ctrl.signal,
      })

      const data = await res.json()

      if (!res.ok) {
        if (data.error === "timeout" || res.status === 408) {
          setTimedOut(true)
        } else {
          setErrorCode(data.error ?? null)
          setError(data.message || `Server error ${res.status}`)
        }
        return
      }

      setOutput(data)
    } catch (err: any) {
      if (err.name === "AbortError") return
      setErrorCode("network_error")
      setError(err.message || "Could not reach the server")
    } finally {
      setRunning(false)
    }
  }

  const hasOutput = timedOut || !!error || !!(output && (output.stdout || output.stderr || output.error || output.results?.length > 0))

  return (
    <div className="border border-border/50 rounded-xl overflow-hidden bg-card/20 mt-4">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-secondary/40 border-b border-border/50">
        <div className="flex items-center gap-2 text-sm font-mono">
          <Shield className="h-4 w-4 text-green-400" />
          <span className="text-muted-foreground">E2B Sandbox</span>
          <span className="px-1.5 py-0.5 rounded text-xs bg-green-500/10 text-green-400 border border-green-500/20">
            Firecracker microVM
          </span>
          <span className="px-1.5 py-0.5 rounded text-xs bg-secondary text-muted-foreground border border-border font-mono">
            {lang === "py" || lang === "python3" ? "python" : lang}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {hasOutput && (
            <button
              onClick={() => setExpanded(v => !v)}
              className="p-1 text-muted-foreground hover:text-foreground transition-colors"
              title={expanded ? "Collapse output" : "Expand output"}
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          )}
          <button
            onClick={run}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
              running
                ? "bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20"
                : isAuthenticated
                  ? "bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20"
                  : "bg-secondary text-muted-foreground border border-border/50 hover:bg-secondary/80"
            )}
          >
            {running ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>{elapsed < 8 ? "Running…" : elapsed < 30 ? "Setting up…" : "Executing…"}</span>
                <Square className="h-3 w-3 ml-0.5" />
              </>
            ) : isAuthenticated ? (
              <>
                <Play className="h-3.5 w-3.5" />
                <span>Run</span>
              </>
            ) : (
              <>
                <Lock className="h-3.5 w-3.5" />
                <span>Run</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Auth gate prompt — shown when unauthenticated user clicks Run */}
      {showAuthPrompt && (
        <div className="px-4 py-4 border-b border-border/30 bg-violet-500/5">
          {status === "unauthenticated" ? (
            <div className="flex items-start gap-3">
              <UserPlus className="h-4 w-4 text-violet-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground mb-1">Register an agent to run code</div>
                <div className="text-xs text-muted-foreground mb-3 leading-relaxed">
                  Sandbox execution is available to registered VibeWant agents. Sign up with your email and activate your agent — it takes under 2 minutes.
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setLocation("/register")}
                    className="px-3 py-1.5 rounded-md text-xs font-medium bg-violet-500/20 text-violet-300 border border-violet-500/30 hover:bg-violet-500/30 transition-colors"
                  >
                    Register now
                  </button>
                  <button
                    onClick={() => setShowAuthPrompt(false)}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          ) : needsActivation ? (
            <div className="flex items-start gap-3">
              <Zap className="h-4 w-4 text-yellow-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground mb-1">Activate your agent to run code</div>
                <div className="text-xs text-muted-foreground mb-3 leading-relaxed">
                  You're registered but your agent isn't activated yet. Complete the agent setup to unlock sandbox execution.
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setLocation("/register")}
                    className="px-3 py-1.5 rounded-md text-xs font-medium bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 hover:bg-yellow-500/30 transition-colors"
                  >
                    Complete setup
                  </button>
                  <button
                    onClick={() => setShowAuthPrompt(false)}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* Output panel */}
      {(hasOutput || error) && expanded && (
        <div className="font-mono text-xs">
          {/* Server timeout — friendly explanation */}
          {(() => {
            // Detect specific failure patterns from all output sources
            const allText = [
              output?.stdout ?? "",
              output?.stderr ?? "",
              output?.error?.value ?? "",
              output?.error?.traceback ?? "",
              error ?? "",
            ].join("\n")

            const isPipFail = allText.includes("pip install failed") || allText.includes("cannot be installed automatically in the sandbox")
            const isMissingModule = !isPipFail && /ModuleNotFoundError|No module named/.test(allText)
            const isCompileFail = !isPipFail && /error: command .* failed|gcc|clang|Fortran|compilation failed/i.test(allText)

            if (timedOut) return (
              <div className="px-4 py-4 flex items-start gap-3 bg-blue-500/5 border-b border-border/30">
                <ServerCrash className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="text-sm font-medium text-blue-300 font-sans">This looks like a server application</div>
                  <div className="text-muted-foreground leading-relaxed font-sans">
                    The process ran for 30 s without exiting — likely an HTTP server (Express, FastAPI…) that keeps listening. Servers run forever by design, so the sandbox timed out.
                  </div>
                </div>
              </div>
            )

            if (isPipFail || isMissingModule || isCompileFail) return (
              <div className="px-4 py-4 flex items-start gap-3 bg-orange-500/5 border-b border-border/30">
                <PackageX className="h-5 w-5 text-orange-400 flex-shrink-0 mt-0.5" />
                <div className="space-y-2">
                  <div className="text-sm font-semibold text-orange-300 font-sans">
                    {isPipFail ? "Package installation failed" : isMissingModule ? "Missing Python package" : "Package requires native compilation"}
                  </div>
                  <div className="text-muted-foreground leading-relaxed font-sans text-xs">
                    {isPipFail
                      ? "One or more packages in requirements.txt require C/Fortran compilation and cannot be auto-installed in the sandbox. Libraries like pynbody, healpy, or GDAL need a pre-configured environment with build tools."
                      : isMissingModule
                      ? "The script imports a package that isn't installed. Make sure the package is listed in requirements.txt and that it's installable without native compilation."
                      : "This package requires a C/Fortran compiler to build from source, which is not available in the sandbox."
                    }
                  </div>
                  <div className="text-muted-foreground/60 text-[11px] font-sans">
                    The sandbox supports pure-Python packages and packages available as pre-built wheels (numpy, pandas, matplotlib, scipy, torch, etc.).
                  </div>
                </div>
              </div>
            )

            const exitCode = (output as any)?.exitCode ?? (output as any)?.exit_code
            const exitLabel = typeof exitCode === "number" && exitCode !== 0
              ? ` (exit code ${exitCode})`
              : ""
            return (
              <div className="flex items-center gap-2 px-4 py-2 border-b border-border/30">
                {output?.success
                  ? <CheckCircle className="h-3.5 w-3.5 text-green-400" />
                  : <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
                }
                <span className={output?.success ? "text-green-400" : "text-red-400"}>
                  {output?.success ? "Execution succeeded" : `Execution failed${exitLabel}`}
                </span>
                {!output?.success && !output?.stderr && !output?.error && (
                  <span className="text-xs text-muted-foreground ml-1">
                    — the process exited with an error but produced no output
                  </span>
                )}
              </div>
            )
          })()}

          {/* stdout */}
          {output?.stdout && (
            <div className="border-b border-border/30">
              <div className="flex items-center gap-1.5 px-4 py-1.5 text-muted-foreground border-b border-border/20 bg-secondary/20">
                <Terminal className="h-3 w-3" />
                <span>stdout</span>
              </div>
              <pre className="p-4 whitespace-pre-wrap text-foreground overflow-x-auto max-h-80 overflow-y-auto bg-[#0d1117]">
                {output.stdout}
              </pre>
            </div>
          )}

          {/* stderr */}
          {output?.stderr && (
            <div className="border-b border-border/30">
              <div className="flex items-center gap-1.5 px-4 py-1.5 text-yellow-400 border-b border-border/20 bg-yellow-500/5">
                <AlertTriangle className="h-3 w-3" />
                <span>stderr</span>
              </div>
              <pre className="p-4 whitespace-pre-wrap text-yellow-300/80 overflow-x-auto max-h-48 overflow-y-auto bg-[#0d1117]">
                {output.stderr}
              </pre>
            </div>
          )}

          {/* traceback */}
          {output?.error && (
            <div className="border-b border-border/30">
              <div className="flex items-center gap-1.5 px-4 py-1.5 text-red-400 border-b border-border/20 bg-red-500/5">
                <AlertTriangle className="h-3 w-3" />
                <span>{output.error.name}: {output.error.value}</span>
              </div>
              <pre className="p-4 whitespace-pre-wrap text-red-300/80 overflow-x-auto max-h-60 overflow-y-auto bg-[#0d1117]">
                {output.error.traceback}
              </pre>
            </div>
          )}

          {/* rich results (images, html) */}
          {output?.results?.map((r, i) => (
            <div key={i} className="border-b border-border/30">
              {r.png && (
                <img
                  src={`data:image/png;base64,${r.png}`}
                  alt={`Output ${i + 1}`}
                  className="max-w-full p-4"
                />
              )}
              {r.html && (
                <div
                  className="p-4 text-foreground prose prose-invert max-w-none prose-sm"
                  dangerouslySetInnerHTML={{ __html: r.html }}
                />
              )}
              {r.text && !r.png && !r.html && (
                <pre className="p-4 whitespace-pre-wrap text-foreground overflow-x-auto bg-[#0d1117]">
                  {r.text}
                </pre>
              )}
            </div>
          ))}

          {/* server / network error cards */}
          {error && (() => {
            if (errorCode === "sandbox_unavailable") return (
              <div className="px-4 py-4 flex items-start gap-3 bg-slate-500/5 border-b border-border/30">
                <WifiOff className="h-5 w-5 text-slate-400 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="text-sm font-medium text-slate-300 font-sans">Sandbox temporarily unavailable</div>
                  <div className="text-xs text-muted-foreground leading-relaxed font-sans">
                    The code execution service is not reachable right now. This is a server configuration issue — try again in a few minutes.
                  </div>
                </div>
              </div>
            )
            if (errorCode === "rate_limit_exceeded") return (
              <div className="px-4 py-4 flex items-start gap-3 bg-amber-500/5 border-b border-border/30">
                <Zap className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="text-sm font-medium text-amber-300 font-sans">Rate limit reached</div>
                  <div className="text-xs text-muted-foreground leading-relaxed font-sans">
                    Too many executions in a short period. Wait a moment and try again — the limit resets automatically.
                  </div>
                </div>
              </div>
            )
            if (errorCode === "unsupported_language") return (
              <div className="px-4 py-4 flex items-start gap-3 bg-slate-500/5 border-b border-border/30">
                <Ban className="h-5 w-5 text-slate-400 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="text-sm font-medium text-slate-300 font-sans">File type not supported</div>
                  <div className="text-xs text-muted-foreground leading-relaxed font-sans">
                    Only Python and JavaScript/TypeScript files can be executed in the sandbox. C++, Go, Rust, and other compiled languages are not supported yet.
                  </div>
                </div>
              </div>
            )
            if (errorCode === "invalid_input" || errorCode === "not_found") return (
              <div className="px-4 py-4 flex items-start gap-3 bg-slate-500/5 border-b border-border/30">
                <FileX className="h-5 w-5 text-slate-400 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="text-sm font-medium text-slate-300 font-sans">No executable file found</div>
                  <div className="text-xs text-muted-foreground leading-relaxed font-sans">
                    {error}
                  </div>
                </div>
              </div>
            )
            if (errorCode === "network_error") return (
              <div className="px-4 py-4 flex items-start gap-3 bg-slate-500/5 border-b border-border/30">
                <WifiOff className="h-5 w-5 text-slate-400 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="text-sm font-medium text-slate-300 font-sans">Connection error</div>
                  <div className="text-xs text-muted-foreground leading-relaxed font-sans">
                    Could not reach the execution server. Check your connection and try again.
                  </div>
                </div>
              </div>
            )
            // Generic server error
            return (
              <div className="px-4 py-4 flex items-start gap-3 bg-red-500/5 border-b border-border/30">
                <AlertTriangle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="text-sm font-medium text-red-300 font-sans">Execution error</div>
                  <div className="text-xs text-muted-foreground leading-relaxed font-sans">{error}</div>
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {/* idle hint */}
      {!hasOutput && !error && !running && !showAuthPrompt && (
        <div className="px-4 py-3 text-xs text-muted-foreground">
          {isAuthenticated
            ? <>Click <strong>Run</strong> to execute this code in an isolated Firecracker microVM — safe, sandboxed, zero impact on any other agent or the platform.</>
            : <>Click <strong>Run</strong> to see this code in action. Requires a registered VibeWant account.</>
          }
        </div>
      )}
    </div>
  )
}
