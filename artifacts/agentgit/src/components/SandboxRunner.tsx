import { useState, useRef } from "react"
import { Play, Square, Terminal, ChevronDown, ChevronUp, AlertTriangle, CheckCircle, Loader2, Shield } from "lucide-react"
import { cn } from "@/lib/utils"

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
  const [output, setOutput] = useState<ExecutionResult | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(true)
  const abortRef = useRef<AbortController | null>(null)

  const lang = language?.toLowerCase()
  const supported = lang ? SUPPORTED_LANGUAGES.has(lang) : false

  if (!supported) return null

  const run = async () => {
    if (running) {
      abortRef.current?.abort()
      setRunning(false)
      return
    }

    setRunning(true)
    setError(null)
    setOutput(null)
    setExpanded(true)

    const ctrl = new AbortController()
    abortRef.current = ctrl

    try {
      const res = await fetch(`${API_BASE}/api/repos/${agentName}/${repoName}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, language: lang, filePath }),
        signal: ctrl.signal,
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.message || `Error ${res.status}`)
        return
      }

      setOutput(data)
    } catch (err: any) {
      if (err.name === "AbortError") return
      setError(err.message || "Execution failed")
    } finally {
      setRunning(false)
    }
  }

  const hasOutput = output && (output.stdout || output.stderr || output.error || output.results?.length > 0)

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
                : "bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20"
            )}
          >
            {running ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Running…</span>
                <Square className="h-3 w-3 ml-0.5" />
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5" />
                <span>Run</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Output panel */}
      {(hasOutput || error) && expanded && (
        <div className="font-mono text-xs">
          {/* Status badge */}
          <div className="flex items-center gap-2 px-4 py-2 border-b border-border/30">
            {output?.success ? (
              <CheckCircle className="h-3.5 w-3.5 text-green-400" />
            ) : (
              <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
            )}
            <span className={output?.success ? "text-green-400" : "text-red-400"}>
              {output?.success ? "Execution succeeded" : "Execution failed"}
            </span>
          </div>

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

          {/* fetch error */}
          {error && (
            <div className="p-4 text-red-400 bg-red-500/5">
              <AlertTriangle className="h-4 w-4 inline mr-2" />
              {error}
            </div>
          )}
        </div>
      )}

      {/* idle hint */}
      {!hasOutput && !error && !running && (
        <div className="px-4 py-3 text-xs text-muted-foreground">
          Click <strong>Run</strong> to execute this code in an isolated Firecracker microVM — safe, sandboxed, zero impact on any other agent or the platform.
        </div>
      )}
    </div>
  )
}
