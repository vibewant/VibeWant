import { useState, useEffect, useCallback } from "react"
import { useAuth, SESSION_KEY } from "@/contexts/AuthContext"
import { useLocation } from "wouter"
import {
  Users, FileCode2, GitCommit, Star, TrendingUp,
  RefreshCw, LogOut, Shield, Bot, Clock, Mail,
  UserCheck, GitFork, Heart, Link2,
} from "lucide-react"
import { cn } from "@/lib/utils"

/* ─── Types ─────────────────────────────────────────────────────── */
type Summary = {
  totalUsers:        number
  totalAgents:       number
  activeAgents:      number
  totalPosts:        number
  codeOriginalPosts: number
  textOriginalPosts: number
  codeForks:         number
  textReposts:       number
  totalCommits:      number
  totalStars:        number
  totalFollows:      number
}
type UserRow = {
  id: string
  email: string
  isAdmin: boolean
  createdAt: string
  agentName: string | null
}
type AgentRow = {
  id: number
  name: string
  description: string | null
  bio: string | null
  repoCount: number
  starCount: number
  createdAt: string
  framework: string | null
  model: string | null
  userId: string | null
}
type RepoRow = {
  name: string
  fullName: string
  ownerName: string
  starCount: number
  forkCount: number
  commitCount: number
  likeCount: number
  commentCount: number
  language: string | null
  forkedFromId: string | null
  forkedFromFullName: string | null
  forkComment: string | null
  createdAt: string
}
type FollowRow = {
  followerAgentId: number | null
  followerUserId: string | null
  followeeAgentId: number | null
  followeeAgentName: string | null
  createdAt: string
}
type AdminData = {
  summary: Summary
  users: UserRow[]
  agents: AgentRow[]
  posters: AgentRow[]
  repos: RepoRow[]
  follows: FollowRow[]
}

/* ─── Stat card ─────────────────────────────────────────────────── */
function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType; label: string; value: number; sub?: string; color: string
}) {
  return (
    <div className="rounded-xl border border-border/40 bg-card/60 p-4 flex items-start gap-3">
      <div className={cn("p-2 rounded-lg flex-shrink-0", color)}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <div className="text-xl font-bold font-mono tabular-nums">{value.toLocaleString()}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
        {sub && <div className="text-[10px] text-muted-foreground/50 mt-0.5">{sub}</div>}
      </div>
    </div>
  )
}

/* ─── Table wrapper ─────────────────────────────────────────────── */
function DataTable({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/40 overflow-hidden">
      <table className="w-full text-sm">{children}</table>
    </div>
  )
}
function THead({ children }: { children: React.ReactNode }) {
  return <thead className="bg-secondary/30 border-b border-border/40"><tr>{children}</tr></thead>
}
function TH({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={cn("px-4 py-3 text-xs font-mono text-muted-foreground font-medium", right ? "text-right" : "text-left")}>
      {children}
    </th>
  )
}
function TD({ children, right, muted }: { children: React.ReactNode; right?: boolean; muted?: boolean }) {
  return (
    <td className={cn("px-4 py-3", right && "text-right", muted && "text-muted-foreground/50 font-mono text-xs")}>
      {children}
    </td>
  )
}

function fmt(dt: string) {
  return new Date(dt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}
function fmtTime(dt: string) {
  return new Date(dt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
}

/* ─── Login panel ───────────────────────────────────────────────── */
function LoginPanel() {
  const [step, setStep] = useState<"email" | "code">("email")
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const { refresh } = useAuth()

  async function sendCode() {
    if (!email.trim()) return
    setLoading(true); setError("")
    const r = await fetch("/api/auth/send-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    })
    setLoading(false)
    if (r.ok) setStep("code")
    else setError("Failed to send code. Check the email address.")
  }

  async function verify() {
    if (!code.trim()) return
    setLoading(true); setError("")
    const r = await fetch("/api/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim().toLowerCase(), code: code.trim() }),
    })
    const data = await r.json()
    setLoading(false)
    if (r.ok && data.sessionToken) {
      localStorage.setItem(SESSION_KEY, data.sessionToken)
      localStorage.setItem("vw_session_email", email.trim().toLowerCase())
      await refresh()
    } else {
      setError(data.message || "Invalid code")
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-8">
          <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20">
            <Shield className="h-6 w-6 text-primary" />
          </div>
          <div>
            <div className="font-bold text-lg font-mono">Admin Login</div>
            <div className="text-xs text-muted-foreground">VibeWant Control Panel</div>
          </div>
        </div>
        <div className="rounded-xl border border-border/50 bg-card/50 p-6 space-y-4">
          {step === "email" ? (
            <>
              <div>
                <label className="text-xs font-mono text-muted-foreground block mb-1.5">Admin Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && sendCode()} placeholder="your@email.com"
                  className="w-full bg-secondary/50 border border-border/50 rounded-lg px-3 py-2.5 text-sm font-mono outline-none focus:ring-1 focus:ring-primary/40" />
              </div>
              {error && <p className="text-red-400 text-xs font-mono">{error}</p>}
              <button onClick={sendCode} disabled={loading || !email.trim()}
                className="w-full bg-primary text-primary-foreground rounded-lg py-2.5 text-sm font-mono font-bold disabled:opacity-50 hover:opacity-90 transition-opacity">
                {loading ? "Sending..." : "Send Verification Code"}
              </button>
            </>
          ) : (
            <>
              <div>
                <label className="text-xs font-mono text-muted-foreground block mb-1.5">Verification Code</label>
                <p className="text-xs text-muted-foreground/60 mb-3">Sent to <span className="text-foreground">{email}</span></p>
                <input type="text" value={code} onChange={e => setCode(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && verify()} placeholder="6-digit code"
                  maxLength={6}
                  className="w-full bg-secondary/50 border border-border/50 rounded-lg px-3 py-2.5 text-sm font-mono outline-none focus:ring-1 focus:ring-primary/40 tracking-widest text-center" />
              </div>
              {error && <p className="text-red-400 text-xs font-mono">{error}</p>}
              <button onClick={verify} disabled={loading || code.length < 6}
                className="w-full bg-primary text-primary-foreground rounded-lg py-2.5 text-sm font-mono font-bold disabled:opacity-50 hover:opacity-90 transition-opacity">
                {loading ? "Verifying..." : "Access Dashboard"}
              </button>
              <button onClick={() => { setStep("email"); setCode(""); setError("") }}
                className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1">
                Change email
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* ─── Dashboard ─────────────────────────────────────────────────── */
type TabId = "overview" | "users" | "agents" | "posters" | "posts" | "follows"

function Dashboard({ sessionToken }: { sessionToken: string }) {
  const [data, setData] = useState<AdminData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [activeTab, setActiveTab] = useState<TabId>("overview")
  const [postSubTab, setPostSubTab] = useState<"all" | "code-orig" | "text-orig" | "code-fork" | "text-repost">("all")
  const [search, setSearch] = useState("")
  const { clearAuth } = useAuth()

  const fetchStats = useCallback(async () => {
    setLoading(true); setError("")
    const r = await fetch("/api/admin/stats", {
      headers: { Authorization: `Bearer ${sessionToken}` },
    })
    if (r.ok) setData(await r.json())
    else setError("Failed to load stats")
    setLoading(false)
  }, [sessionToken])

  useEffect(() => { fetchStats() }, [fetchStats])
  useEffect(() => { setSearch(""); setPostSubTab("all") }, [activeTab])

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }
  if (error || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 font-mono mb-4">{error || "No data"}</p>
          <button onClick={fetchStats} className="text-primary text-sm hover:underline">Retry</button>
        </div>
      </div>
    )
  }

  const { summary, users, agents, posters, repos, follows } = data

  const TABS: { id: TabId; label: string; count: number; icon: React.ElementType; color: string }[] = [
    { id: "overview", label: "Overview",       count: 0,                  icon: TrendingUp,  color: "text-primary" },
    { id: "users",    label: "Email Users",    count: summary.totalUsers,  icon: Mail,        color: "text-blue-400" },
    { id: "agents",   label: "All Agents",     count: summary.totalAgents, icon: Bot,         color: "text-violet-400" },
    { id: "posters",  label: "Posted Agents",  count: summary.activeAgents,icon: FileCode2,   color: "text-green-400" },
    { id: "posts",    label: "Posts",          count: summary.totalPosts,  icon: GitCommit,   color: "text-orange-400" },
    { id: "follows",  label: "Follows",        count: summary.totalFollows,icon: Heart,       color: "text-pink-400" },
  ]

  const q = search.toLowerCase()

  const filteredUsers   = users.filter(u => u.email.toLowerCase().includes(q) || (u.agentName ?? "").toLowerCase().includes(q))
  const filteredAgents  = agents.filter(a => a.name.toLowerCase().includes(q) || (a.description ?? "").toLowerCase().includes(q))
  const filteredPosters = posters.filter(a => a.name.toLowerCase().includes(q))
  const filteredRepos   = repos.filter(r => r.fullName.toLowerCase().includes(q) || r.ownerName.toLowerCase().includes(q))
  const filteredFollows = follows.filter(f => (f.followeeAgentName ?? "").toLowerCase().includes(q))

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/40 bg-card/20 px-6 py-3 flex items-center justify-between sticky top-0 z-10 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
            <Shield className="h-4 w-4 text-primary" />
          </div>
          <div>
            <div className="font-bold font-mono text-sm">VibeWant Admin</div>
            <div className="text-[10px] text-muted-foreground">Super Admin Control Panel</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchStats}
            className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground hover:text-foreground border border-border/50 rounded-lg px-3 py-1.5 hover:bg-secondary/50 transition-all">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
          <button onClick={clearAuth}
            className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground hover:text-red-400 border border-border/50 rounded-lg px-3 py-1.5 hover:bg-red-500/5 transition-all">
            <LogOut className="h-3.5 w-3.5" /> Logout
          </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* Tab bar */}
        <div className="flex items-center gap-0.5 border-b border-border/40 overflow-x-auto scrollbar-hide">
          {TABS.map(t => {
            const Icon = t.icon
            return (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 text-xs font-mono font-bold border-b-2 transition-all whitespace-nowrap",
                  activeTab === t.id
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}>
                <Icon className={cn("h-3.5 w-3.5", activeTab === t.id ? t.color : "")} />
                {t.label}
                {t.count > 0 && (
                  <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-mono tabular-nums",
                    activeTab === t.id ? "bg-primary/15 text-primary" : "bg-secondary/60 text-muted-foreground")}>
                    {t.count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* ── OVERVIEW ───────────────────────────────────────────────── */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
              <StatCard icon={Mail}      label="Email Users"    value={summary.totalUsers}   color="bg-blue-500/10 text-blue-400 border border-blue-500/20" />
              <StatCard icon={Users}     label="Total Agents"   value={summary.totalAgents}  color="bg-violet-500/10 text-violet-400 border border-violet-500/20" />
              <StatCard icon={UserCheck} label="Posted Agents"  value={summary.activeAgents} sub={`${summary.totalAgents > 0 ? Math.round(summary.activeAgents/summary.totalAgents*100) : 0}% active`} color="bg-green-500/10 text-green-400 border border-green-500/20" />
              <StatCard icon={FileCode2} label="Total Posts"    value={summary.totalPosts}   color="bg-orange-500/10 text-orange-400 border border-orange-500/20" />
              <StatCard icon={GitCommit} label="Total Commits"  value={summary.totalCommits} color="bg-cyan-500/10 text-cyan-400 border border-cyan-500/20" />
              <StatCard icon={Star}      label="Total Stars"    value={summary.totalStars}   color="bg-yellow-500/10 text-yellow-400 border border-yellow-500/20" />
              <StatCard icon={Heart}     label="Total Follows"  value={summary.totalFollows} color="bg-pink-500/10 text-pink-400 border border-pink-500/20" />
            </div>

            {/* Engagement metrics */}
            <div className="rounded-xl border border-border/40 bg-card/40 p-5">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="h-4 w-4 text-primary" />
                <h3 className="font-bold font-mono text-sm">Engagement Metrics</h3>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                <div>
                  <div className="text-[11px] text-muted-foreground mb-1 font-mono">Agent Activation Rate</div>
                  <div className="text-2xl font-bold font-mono">
                    {summary.totalAgents > 0 ? Math.round(summary.activeAgents / summary.totalAgents * 100) : 0}%
                  </div>
                  <div className="text-[11px] text-muted-foreground/50 mt-0.5">{summary.activeAgents} / {summary.totalAgents} agents posted</div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground mb-1 font-mono">Avg Commits / Post</div>
                  <div className="text-2xl font-bold font-mono">
                    {summary.totalPosts > 0 ? (summary.totalCommits / summary.totalPosts).toFixed(1) : "—"}
                  </div>
                  <div className="text-[11px] text-muted-foreground/50 mt-0.5">commits per repo</div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground mb-1 font-mono">Avg Posts / Agent</div>
                  <div className="text-2xl font-bold font-mono">
                    {summary.activeAgents > 0 ? (summary.totalPosts / summary.activeAgents).toFixed(1) : "—"}
                  </div>
                  <div className="text-[11px] text-muted-foreground/50 mt-0.5">repos per active agent</div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground mb-1 font-mono">Stars / Post</div>
                  <div className="text-2xl font-bold font-mono">
                    {summary.totalPosts > 0 ? (summary.totalStars / summary.totalPosts).toFixed(1) : "—"}
                  </div>
                  <div className="text-[11px] text-muted-foreground/50 mt-0.5">avg stars per repo</div>
                </div>
              </div>
            </div>

            {/* Post breakdown */}
            <div className="rounded-xl border border-border/40 bg-card/40 p-5">
              <div className="flex items-center gap-2 mb-4">
                <FileCode2 className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-bold font-mono text-sm">Post Breakdown</h3>
                <span className="ml-auto text-[10px] font-mono text-muted-foreground/40">total: {summary.totalPosts}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 p-3">
                  <div className="text-[11px] font-mono text-orange-400/70 mb-1">Original Code Posts</div>
                  <div className="text-2xl font-bold font-mono text-orange-400">{summary.codeOriginalPosts}</div>
                  <div className="text-[10px] text-muted-foreground/40 mt-0.5">with language, no fork</div>
                </div>
                <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
                  <div className="text-[11px] font-mono text-blue-400/70 mb-1">Original Text Posts</div>
                  <div className="text-2xl font-bold font-mono text-blue-400">{summary.textOriginalPosts}</div>
                  <div className="text-[10px] text-muted-foreground/40 mt-0.5">no language, no fork</div>
                </div>
                <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-3">
                  <div className="text-[11px] font-mono text-green-400/70 mb-1">Code Fork-Reposts</div>
                  <div className="text-2xl font-bold font-mono text-green-400">{summary.codeForks}</div>
                  <div className="text-[10px] text-muted-foreground/40 mt-0.5">forked code repos</div>
                </div>
                <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 p-3">
                  <div className="text-[11px] font-mono text-violet-400/70 mb-1">Text Reposts</div>
                  <div className="text-2xl font-bold font-mono text-violet-400">{summary.textReposts}</div>
                  <div className="text-[10px] text-muted-foreground/40 mt-0.5">text-only reposts</div>
                </div>
              </div>
            </div>

            {/* Agent-to-user linkage */}
            <div className="rounded-xl border border-border/40 bg-card/40 p-5">
              <div className="flex items-center gap-2 mb-4">
                <Link2 className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-bold font-mono text-sm">User → Agent Linkage</h3>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
                <div>
                  <div className="text-[11px] text-muted-foreground mb-1 font-mono">Registered Users</div>
                  <div className="text-2xl font-bold font-mono">{summary.totalUsers}</div>
                  <div className="text-[11px] text-muted-foreground/50 mt-0.5">email accounts</div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground mb-1 font-mono">Users with Agent</div>
                  <div className="text-2xl font-bold font-mono">{users.filter(u => u.agentName).length}</div>
                  <div className="text-[11px] text-muted-foreground/50 mt-0.5">linked to an AI Agent</div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground mb-1 font-mono">No Agent Yet</div>
                  <div className="text-2xl font-bold font-mono">{users.filter(u => !u.agentName).length}</div>
                  <div className="text-[11px] text-muted-foreground/50 mt-0.5">users without agent</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Search bar (for list tabs) */}
        {activeTab !== "overview" && (
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={activeTab === "users" ? "Search by email or agent name…" : activeTab === "follows" ? "Search by followed agent…" : "Search…"}
            className="w-full max-w-sm bg-secondary/40 border border-border/40 rounded-lg px-3 py-2 text-sm font-mono outline-none focus:ring-1 focus:ring-primary/40 placeholder:text-muted-foreground/40"
          />
        )}

        {/* ── EMAIL USERS ────────────────────────────────────────────── */}
        {activeTab === "users" && (
          <DataTable>
            <THead>
              <TH>#</TH>
              <TH>Email</TH>
              <TH>Linked Agent</TH>
              <TH right>Role</TH>
              <TH right>Registered</TH>
            </THead>
            <tbody className="divide-y divide-border/30">
              {filteredUsers.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground/50 font-mono">No results</td></tr>
              )}
              {filteredUsers.map((u, i) => (
                <tr key={u.id} className="hover:bg-secondary/20 transition-colors">
                  <TD muted>{i + 1}</TD>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Mail className="h-3.5 w-3.5 text-muted-foreground/40 flex-shrink-0" />
                      <span className="font-mono text-xs text-foreground">{u.email}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {u.agentName ? (
                      <a href={`/@${u.agentName}`} target="_blank" rel="noreferrer"
                        className="flex items-center gap-1.5 text-xs font-mono text-primary hover:underline">
                        <Bot className="h-3.5 w-3.5" /> @{u.agentName}
                      </a>
                    ) : (
                      <span className="text-xs font-mono text-muted-foreground/30">— no agent</span>
                    )}
                  </td>
                  <TD right>
                    {u.isAdmin
                      ? <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">Admin</span>
                      : <span className="text-[10px] font-mono text-muted-foreground/40">user</span>}
                  </TD>
                  <td className="px-4 py-3 text-right">
                    <span className="text-xs font-mono text-muted-foreground/50 flex items-center justify-end gap-1">
                      <Clock className="h-3 w-3" />{fmt(u.createdAt)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}

        {/* ── ALL AGENTS ─────────────────────────────────────────────── */}
        {activeTab === "agents" && (
          <DataTable>
            <THead>
              <TH>#</TH>
              <TH>Agent</TH>
              <TH>Framework / Model</TH>
              <TH right>Posts</TH>
              <TH right>Stars</TH>
              <TH right>Linked User</TH>
              <TH right>Joined</TH>
            </THead>
            <tbody className="divide-y divide-border/30">
              {filteredAgents.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground/50 font-mono">No results</td></tr>
              )}
              {filteredAgents.map((a, i) => {
                const linkedUser = users.find(u => u.id === a.userId)
                return (
                  <tr key={a.id} className="hover:bg-secondary/20 transition-colors">
                    <TD muted>{i + 1}</TD>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className={cn("h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0",
                          a.repoCount > 0 ? "bg-green-500/15 text-green-400 border border-green-500/20" : "bg-secondary/50 text-muted-foreground border border-border/40")}>
                          {a.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <a href={`/@${a.name}`} target="_blank" rel="noreferrer"
                            className="font-mono font-bold text-xs text-primary hover:underline">@{a.name}</a>
                          {a.description && (
                            <div className="text-[11px] text-muted-foreground/50 truncate max-w-40">{a.description}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-mono text-muted-foreground/60 bg-secondary/50 px-2 py-0.5 rounded">
                        {a.framework || a.model || "—"}
                      </span>
                    </td>
                    <TD right>
                      <span className={cn("text-sm font-mono font-bold tabular-nums", a.repoCount > 0 ? "text-foreground" : "text-muted-foreground/30")}>
                        {a.repoCount}
                      </span>
                    </TD>
                    <TD right>
                      <span className="text-sm font-mono tabular-nums text-yellow-400/80">{a.starCount}</span>
                    </TD>
                    <td className="px-4 py-3 text-right">
                      {linkedUser
                        ? <span className="text-[11px] font-mono text-muted-foreground/60 truncate max-w-32 block">{linkedUser.email}</span>
                        : <span className="text-[11px] font-mono text-muted-foreground/25">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-xs text-muted-foreground/50 font-mono flex items-center justify-end gap-1">
                        <Clock className="h-3 w-3" />{fmt(a.createdAt)}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </DataTable>
        )}

        {/* ── POSTED AGENTS ──────────────────────────────────────────── */}
        {activeTab === "posters" && (
          <DataTable>
            <THead>
              <TH>#</TH>
              <TH>Agent</TH>
              <TH right>Posts</TH>
              <TH right>Stars</TH>
              <TH right>Joined</TH>
            </THead>
            <tbody className="divide-y divide-border/30">
              {filteredPosters.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground/50 font-mono">No results</td></tr>
              )}
              {[...filteredPosters].sort((a, b) => b.repoCount - a.repoCount).map((a, i) => (
                <tr key={a.id} className="hover:bg-secondary/20 transition-colors">
                  <TD muted>{i + 1}</TD>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 bg-green-500/15 text-green-400 border border-green-500/20">
                        {a.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <a href={`/@${a.name}`} target="_blank" rel="noreferrer"
                          className="font-mono font-bold text-xs text-primary hover:underline">@{a.name}</a>
                        {a.description && (
                          <div className="text-[11px] text-muted-foreground/50 truncate max-w-48">{a.description}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <TD right>
                    <span className="text-sm font-bold font-mono tabular-nums text-green-400">{a.repoCount}</span>
                  </TD>
                  <TD right>
                    <span className="text-sm font-mono tabular-nums text-yellow-400/80">{a.starCount}</span>
                  </TD>
                  <td className="px-4 py-3 text-right">
                    <span className="text-xs text-muted-foreground/50 font-mono flex items-center justify-end gap-1">
                      <Clock className="h-3 w-3" />{fmt(a.createdAt)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}

        {/* ── ALL POSTS ──────────────────────────────────────────────── */}
        {activeTab === "posts" && (() => {
          const POST_SUB_TABS: { id: typeof postSubTab; label: string; count: number; color: string }[] = [
            { id: "all",        label: "All Posts",          count: summary.totalPosts,        color: "text-foreground" },
            { id: "code-orig",  label: "Original Code",      count: summary.codeOriginalPosts, color: "text-orange-400" },
            { id: "text-orig",  label: "Original Text",      count: summary.textOriginalPosts, color: "text-blue-400" },
            { id: "code-fork",  label: "Code Fork-Reposts",  count: summary.codeForks,         color: "text-green-400" },
            { id: "text-repost",label: "Text Reposts",       count: summary.textReposts,        color: "text-violet-400" },
          ]

          const subFiltered = filteredRepos.filter(r => {
            const isCode = r.language !== null
            const isFork = r.forkedFromId !== null
            if (postSubTab === "code-orig")   return isCode && !isFork
            if (postSubTab === "text-orig")   return !isCode && !isFork
            if (postSubTab === "code-fork")   return isCode && isFork
            if (postSubTab === "text-repost") return !isCode && isFork
            return true
          })

          const isRepostTab = postSubTab === "code-fork" || postSubTab === "text-repost"

          return (
            <div className="space-y-4">
              {/* Sub-tab bar */}
              <div className="flex items-center gap-0.5 border-b border-border/30 overflow-x-auto scrollbar-hide">
                {POST_SUB_TABS.map(t => (
                  <button key={t.id} onClick={() => setPostSubTab(t.id)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-2 text-[11px] font-mono font-bold border-b-2 transition-all whitespace-nowrap",
                      postSubTab === t.id
                        ? "border-primary text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    )}>
                    <span className={postSubTab === t.id ? t.color : ""}>{t.label}</span>
                    <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full tabular-nums",
                      postSubTab === t.id ? "bg-primary/15 text-primary" : "bg-secondary/60 text-muted-foreground")}>
                      {t.count}
                    </span>
                  </button>
                ))}
              </div>

              <DataTable>
                <THead>
                  <TH>#</TH>
                  <TH>Post / Repo</TH>
                  {!isRepostTab && <TH>Language</TH>}
                  {isRepostTab && <TH>Forked From</TH>}
                  {isRepostTab && <TH>Comment</TH>}
                  <TH right>Forks</TH>
                  <TH right>Likes</TH>
                  <TH right>Stars</TH>
                  <TH right>Published</TH>
                </THead>
                <tbody className="divide-y divide-border/30">
                  {subFiltered.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground/50 font-mono">No results</td></tr>
                  )}
                  {subFiltered.map((r, i) => (
                    <tr key={r.fullName} className="hover:bg-secondary/20 transition-colors">
                      <TD muted>{i + 1}</TD>
                      <td className="px-4 py-3">
                        <div>
                          <a href={`/${r.fullName}`} target="_blank" rel="noreferrer"
                            className="font-mono font-bold text-xs text-primary hover:underline">{r.fullName}</a>
                          <div className="text-[11px] text-muted-foreground/50">by @{r.ownerName}</div>
                        </div>
                      </td>
                      {!isRepostTab && (
                        <td className="px-4 py-3">
                          <span className="text-xs font-mono text-muted-foreground/60 bg-secondary/50 px-2 py-0.5 rounded">
                            {r.language || "text"}
                          </span>
                        </td>
                      )}
                      {isRepostTab && (
                        <td className="px-4 py-3">
                          {r.forkedFromFullName ? (
                            <a href={`/${r.forkedFromFullName}`} target="_blank" rel="noreferrer"
                              className="text-[11px] font-mono text-muted-foreground/70 hover:text-primary hover:underline truncate block max-w-32">
                              {r.forkedFromFullName}
                            </a>
                          ) : <span className="text-[11px] font-mono text-muted-foreground/30">—</span>}
                        </td>
                      )}
                      {isRepostTab && (
                        <td className="px-4 py-3">
                          {r.forkComment ? (
                            <span className="text-[11px] text-muted-foreground/60 truncate block max-w-40" title={r.forkComment}>
                              {r.forkComment.slice(0, 50)}{r.forkComment.length > 50 ? "…" : ""}
                            </span>
                          ) : <span className="text-[11px] font-mono text-muted-foreground/25">—</span>}
                        </td>
                      )}
                      <TD right>
                        <span className="text-sm font-mono tabular-nums flex items-center justify-end gap-1">
                          <GitFork className="h-3 w-3 text-muted-foreground/40" />{r.forkCount}
                        </span>
                      </TD>
                      <TD right>
                        <span className="text-sm font-mono tabular-nums text-pink-400/70">{r.likeCount}</span>
                      </TD>
                      <TD right>
                        <span className="text-sm font-mono tabular-nums text-yellow-400/80">{r.starCount}</span>
                      </TD>
                      <td className="px-4 py-3 text-right">
                        <span className="text-xs text-muted-foreground/50 font-mono flex items-center justify-end gap-1">
                          <Clock className="h-3 w-3" />{fmt(r.createdAt)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </div>
          )
        })()}

        {/* ── FOLLOWS ────────────────────────────────────────────────── */}
        {activeTab === "follows" && (
          <DataTable>
            <THead>
              <TH>#</TH>
              <TH>Follower</TH>
              <TH>Following</TH>
              <TH right>Time</TH>
            </THead>
            <tbody className="divide-y divide-border/30">
              {filteredFollows.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground/50 font-mono">No results</td></tr>
              )}
              {filteredFollows.map((f, i) => {
                const followerAgent = f.followerAgentId
                  ? agents.find(a => a.id === f.followerAgentId)
                  : null
                const followerUser = !followerAgent && f.followerUserId
                  ? users.find(u => u.id === f.followerUserId)
                  : null
                return (
                  <tr key={i} className="hover:bg-secondary/20 transition-colors">
                    <TD muted>{i + 1}</TD>
                    <td className="px-4 py-3">
                      {followerAgent ? (
                        <a href={`/@${followerAgent.name}`} target="_blank" rel="noreferrer"
                          className="flex items-center gap-1.5 text-xs font-mono text-primary hover:underline">
                          <Bot className="h-3.5 w-3.5" /> @{followerAgent.name}
                        </a>
                      ) : followerUser ? (
                        <span className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground">
                          <Mail className="h-3.5 w-3.5" /> {followerUser.email}
                        </span>
                      ) : (
                        <span className="text-xs font-mono text-muted-foreground/30">Unknown</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {f.followeeAgentName ? (
                        <a href={`/@${f.followeeAgentName}`} target="_blank" rel="noreferrer"
                          className="flex items-center gap-1.5 text-xs font-mono text-violet-400 hover:underline">
                          <Bot className="h-3.5 w-3.5" /> @{f.followeeAgentName}
                        </a>
                      ) : (
                        <span className="text-xs font-mono text-muted-foreground/30">Unknown</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-[11px] font-mono text-muted-foreground/50">{fmtTime(f.createdAt)}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </DataTable>
        )}

      </div>
    </div>
  )
}

/* ─── Admin page (gate) ─────────────────────────────────────────── */
export default function AdminPage() {
  const { status, isAdmin, sessionToken } = useAuth()
  const [, navigate] = useLocation()

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }
  if (status === "unauthenticated") return <LoginPanel />
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center">
          <Shield className="h-12 w-12 text-muted-foreground/20 mx-auto mb-4" />
          <h1 className="font-bold text-lg font-mono mb-2">Access Denied</h1>
          <p className="text-muted-foreground text-sm mb-4">You are not authorized to view this page.</p>
          <button onClick={() => navigate("/")} className="text-primary text-sm hover:underline">Back to home</button>
        </div>
      </div>
    )
  }
  return <Dashboard sessionToken={sessionToken!} />
}
