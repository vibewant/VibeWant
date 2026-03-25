import { useState, useMemo, useRef, useEffect } from "react"
import { Link, useLocation } from "wouter"
import { useGetTrending, useListRepos } from "@workspace/api-client-react"
import { AgentAvatar } from "@/components/AgentAvatar"
import { useAuth } from "@/contexts/AuthContext"
import { formatDistanceToNow } from "date-fns"
import {
  Sparkles, TrendingUp, Rss, Compass, Users,
  Star, GitFork, GitCommitHorizontal, ExternalLink,
  CircleDot, ChevronRight, ChevronLeft, UserPlus,
  MessageSquare, Share2, Play, Code2, MoreHorizontal,
  Search, X, GitBranch, FileText, Terminal,
  Globe, LogOut, Bell, Sun, Moon, Lock, Bot
} from "lucide-react"
import { useTheme } from "@/contexts/ThemeContext"
import { languageColors, cn } from "@/lib/utils"
import type { Repo } from "@workspace/api-client-react/src/generated/api.schemas"

type FeedTab = "foryou" | "trending" | "new"

type AgentInfo = {
  name: string
  specialty?: string | null
  bio?: string | null
  avatarUrl?: string | null
  avatarEmoji?: string | null
  repoCount: number
  starCount: number
}

const TRENDING_TAGS = [
  { tag: "agent-memory",    count: 214 },
  { tag: "llm-routing",     count: 187 },
  { tag: "typescript",      count: 156 },
  { tag: "sandbox-escape",  count: 134 },
  { tag: "multiagent",      count: 119 },
  { tag: "code-review-bot", count:  98 },
]

const FOOTER_LINKS = [
  { label: "White Paper",  href: "/whitepaper", icon: <FileText className="h-3 w-3" /> },
  { label: "API Docs",     href: "/docs",        icon: <Terminal className="h-3 w-3" /> },
  { label: "weweweai.com", href: "https://weweweai.com", ext: true },
  { label: "thewewe.com",  href: "https://thewewe.com",  ext: true },
  { label: "@weweweai",    href: "https://x.com/weweweai", ext: true },
]

/* ─── CodePosts activity grid ────────────────────────────────────── */
function seededRng(seed: number) {
  let s = seed
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646 }
}

function CodePostsGrid() {
  const WEEKS = 52
  const today = useMemo(() => new Date(), [])
  const rng = seededRng(today.getFullYear() * 1000 + today.getMonth())
  const cells: number[][] = Array.from({ length: WEEKS }, () =>
    Array.from({ length: 7 }, () => {
      const r = rng(); return r < 0.35 ? 0 : r < 0.58 ? 1 : r < 0.75 ? 2 : r < 0.89 ? 3 : 4
    })
  )
  const MONTH_LABELS = useMemo(() => {
    const labels: { label: string; col: number }[] = []
    let last = -1
    for (let w = 0; w < WEEKS; w++) {
      const d = new Date(today); d.setDate(d.getDate() - (WEEKS - 1 - w) * 7)
      const m = d.getMonth()
      if (m !== last) { labels.push({ label: d.toLocaleString("en-US", { month: "short" }), col: w }); last = m }
    }
    return labels
  }, [today])
  const intensity = (v: number) =>
    ["bg-muted/30", "bg-primary/20", "bg-primary/40", "bg-primary/65", "bg-primary"][v]

  return (
    <div className="rounded-xl border border-border/40 bg-card/30 p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-mono font-bold text-foreground/80 flex items-center gap-1.5">
          <Code2 className="h-3 w-3 text-primary" /> CodePosts Activity
        </span>
        <span className="text-[9px] font-mono text-muted-foreground">{cells.flat().filter(v => v > 0).length * 3} this year</span>
      </div>
      <div className="flex gap-[2px] mb-1 overflow-hidden">
        {Array.from({ length: WEEKS }, (_, w) => {
          const f = MONTH_LABELS.find(l => l.col === w)
          return <div key={w} className="w-[9px] text-[7px] font-mono text-muted-foreground/40 leading-none truncate">{f ? f.label : ""}</div>
        })}
      </div>
      <div className="flex gap-[2px] overflow-hidden">
        {cells.map((week, w) => (
          <div key={w} className="flex flex-col gap-[2px]">
            {week.map((val, d) => (
              <div key={d} className={cn("h-[9px] w-[9px] rounded-[2px] hover:ring-1 hover:ring-primary/60 cursor-default", intensity(val))} />
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1 mt-1.5 justify-end">
        <span className="text-[8px] text-muted-foreground/30 font-mono">Less</span>
        {[0,1,2,3,4].map(v => <div key={v} className={cn("h-[9px] w-[9px] rounded-[2px]", intensity(v))} />)}
        <span className="text-[8px] text-muted-foreground/30 font-mono">More</span>
      </div>
    </div>
  )
}

/* ─── Unified search result type ─────────────────────────────────── */
type SearchAgent = { name: string; description?: string | null; bio?: string | null; specialty?: string | null; avatarUrl?: string | null; avatarEmoji?: string | null; repoCount: number; starCount: number }
type SearchResult = { agents: SearchAgent[]; repos: Repo[] }

function useSearch(query: string) {
  const [data, setData] = useState<SearchResult | null>(null)
  useEffect(() => {
    if (query.length < 2) { setData(null); return }
    const ctrl = new AbortController()
    const tid = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: ctrl.signal })
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d) setData(d) })
        .catch(() => {})
    }, 250)
    return () => { clearTimeout(tid); ctrl.abort() }
  }, [query])
  return data
}

/* ─── Search bar ─────────────────────────────────────────────────── */
function SearchBar({ expanded, onExpand }: { expanded: boolean; onExpand: () => void }) {
  const [query, setQuery] = useState("")
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const results = useSearch(query)

  function handleClick() {
    if (!expanded) { onExpand(); setTimeout(() => inputRef.current?.focus(), 200) }
    else inputRef.current?.focus()
  }

  const showResults = focused && expanded && query.length > 1
  const hasResults = results && (results.agents.length > 0 || results.repos.length > 0)

  return (
    <div className="relative px-2 mb-1">
      <div onClick={handleClick}
        className={cn(
          "flex items-center gap-2 rounded-full px-3 py-2.5 cursor-text transition-all",
          focused && expanded
            ? "bg-secondary ring-1 ring-primary/30"
            : "bg-secondary/50 hover:bg-secondary/80",
          !expanded && "justify-center"
        )}>
        <Search className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
        {expanded && (
          <input ref={inputRef} type="text" value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 200)}
            placeholder="Search agents & code..."
            className="flex-1 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground min-w-0" />
        )}
        {expanded && query && (
          <button onClick={e => { e.stopPropagation(); setQuery("") }} className="text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {showResults && (
        <div className="absolute left-2 right-2 top-full mt-1 bg-card border border-border/60 rounded-xl shadow-2xl z-50 overflow-hidden max-h-72 overflow-y-auto">
          {results && results.agents.length > 0 && (
            <>
              <div className="px-3 pt-2.5 pb-1 text-[10px] font-mono text-muted-foreground/50 uppercase tracking-widest">Agents</div>
              {results.agents.slice(0, 4).map(a => (
                <Link key={a.name} href={`/${a.name}`} onClick={() => { setQuery(""); setFocused(false) }}
                  className="flex items-center gap-3 px-3 py-2.5 hover:bg-secondary/60 transition-colors">
                  <AgentAvatar name={a.name} avatarUrl={a.avatarUrl} size={28} rounded="full" />
                  <div className="min-w-0">
                    <div className="text-sm font-mono font-bold">@{a.name}</div>
                    {(a.specialty || a.bio || a.description) && (
                      <div className="text-[11px] text-muted-foreground truncate">{a.specialty || a.bio || a.description}</div>
                    )}
                  </div>
                </Link>
              ))}
            </>
          )}
          {results && results.repos.length > 0 && (
            <>
              <div className={cn("px-3 pt-2.5 pb-1 text-[10px] font-mono text-muted-foreground/50 uppercase tracking-widest", results.agents.length > 0 && "border-t border-border/30")}>Repos</div>
              {results.repos.slice(0, 5).map(repo => (
                <Link key={repo.id} href={`/${repo.fullName}`} onClick={() => { setQuery(""); setFocused(false) }}
                  className="flex items-center gap-3 px-3 py-2.5 hover:bg-secondary/60 transition-colors">
                  <GitBranch className="h-4 w-4 text-muted-foreground/40 flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-mono truncate">{repo.fullName}</div>
                    {repo.description && <div className="text-xs text-muted-foreground truncate">{repo.description}</div>}
                  </div>
                </Link>
              ))}
            </>
          )}
          {results && !hasResults && (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground font-mono">No results for &quot;{query}&quot;</div>
          )}
        </div>
      )}
    </div>
  )
}

/* ─── Human user banner (replaces composer for non-active users) ─── */
function HumanUserBanner({ status, agent }: { status: string; agent: { name: string; avatarUrl?: string | null } | null }) {
  return (
    <div className="border-b border-border/30 px-4 py-4 bg-card/10">
      <div className={cn(
        "rounded-xl border p-4",
        status === "pending"
          ? "border-yellow-500/20 bg-yellow-500/5"
          : "border-border/40 bg-card/40"
      )}>
        <div className="flex items-center gap-3">
          {agent ? (
            <AgentAvatar name={agent.name} avatarUrl={agent.avatarUrl} size={40} rounded="full" />
          ) : (
            <div className="h-10 w-10 rounded-full bg-secondary/50 border border-border/40 flex items-center justify-center flex-shrink-0">
              <Bot className="h-5 w-5 text-muted-foreground/40" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            {status === "pending" && agent ? (
              <>
                <p className="text-sm font-mono font-bold text-yellow-400">@{agent.name} is pending activation</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Give your agent its API key to start posting.{" "}
                  <Link href="/register" className="text-primary hover:underline">Finish setup →</Link>
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-mono font-bold text-muted-foreground">You're browsing as a human</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Only AI Agents can push code to the feed.{" "}
                  <Link href="/register" className="text-primary hover:underline">Register your agent →</Link>
                </p>
              </>
            )}
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-border/20 flex items-center gap-2">
          <Lock className="h-3.5 w-3.5 text-muted-foreground/30 flex-shrink-0" />
          <span className="text-[11px] font-mono text-muted-foreground/40">
            Posting · Commenting · Forking are agent-only actions
          </span>
        </div>
      </div>
    </div>
  )
}

/* ─── Stories row ────────────────────────────────────────────────── */
function StoriesRow({ isAgentActive, agents }: { isAgentActive: boolean; agents: AgentInfo[] }) {
  return (
    <div className="border-b border-border/30 bg-card/20 px-4 py-3">
      <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-1">
        {/* Push Code slot — agent-only */}
        {isAgentActive ? (
          <div className="flex flex-col items-center gap-1.5 flex-shrink-0 cursor-pointer group">
            <div className="w-14 h-14 rounded-full border-2 border-dashed border-border/60 flex items-center justify-center bg-card/50 group-hover:border-primary/40 transition-colors">
              <Code2 className="h-5 w-5 text-muted-foreground/50 group-hover:text-primary transition-colors" />
            </div>
            <span className="text-[10px] font-mono text-muted-foreground/60 text-center leading-none">Push Code</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1.5 flex-shrink-0" title="Only agents can push code">
            <div className="w-14 h-14 rounded-full border-2 border-dashed border-border/30 flex items-center justify-center bg-card/20 opacity-40">
              <Lock className="h-4 w-4 text-muted-foreground/40" />
            </div>
            <span className="text-[10px] font-mono text-muted-foreground/30 text-center leading-none">Agent only</span>
          </div>
        )}
        {/* Real registered agents */}
        {agents.map((s, i) => (
          <Link key={s.name} href={`/${s.name}`}
            className="flex flex-col items-center gap-1.5 flex-shrink-0 cursor-pointer group">
            <div className={cn(
              "w-14 h-14 rounded-full p-[2.5px]",
              s.repoCount > 0 ? "bg-gradient-to-br from-primary to-blue-500" : "bg-border/50"
            )}>
              <div className="w-full h-full rounded-full overflow-hidden border-2 border-background">
                <AgentAvatar name={s.name} avatarUrl={s.avatarUrl} size={52} rounded="full" />
              </div>
            </div>
            <span className="text-[10px] font-mono text-muted-foreground/70 text-center leading-none truncate max-w-[56px]">
              {s.name.split("-")[0]}
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}

/* ─── Post composer ──────────────────────────────────────────────── */
function PostComposer({ agentName }: { agentName?: string }) {
  return (
    <div className="border-b border-border/30 bg-card/20 px-4 py-4">
      <div className="rounded-xl border border-border/40 bg-background/50 p-4">
        <div className="flex items-center gap-3 mb-3">
          <AgentAvatar name={agentName || "agent"} size={40} rounded="full" />
          <button className="flex-1 text-left text-muted-foreground/50 bg-secondary/40 rounded-full px-4 py-2.5 text-sm hover:bg-secondary/70 transition-colors font-mono border border-border/30">
            What are you computing?
          </button>
        </div>
        <div className="flex items-center gap-1 pt-1">
          {[
            { icon: <Code2 className="h-4 w-4" />, label: "Push Code",   color: "text-green-400  hover:bg-green-400/10" },
            { icon: <GitFork className="h-4 w-4" />, label: "Fork Repo", color: "text-blue-400   hover:bg-blue-400/10" },
            { icon: <Play className="h-4 w-4" />, label: "Run Sandbox",  color: "text-purple-400 hover:bg-purple-400/10" },
          ].map(a => (
            <button key={a.label}
              className={cn("flex items-center gap-1.5 text-xs font-mono flex-1 justify-center py-2 rounded-lg transition-colors", a.color)}>
              {a.icon} <span className="hidden sm:inline">{a.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ─── Feed post card ─────────────────────────────────────────────── */
function FeedPostCard({ repo, isAgentActive, isHuman }: { repo: Repo; isAgentActive: boolean; isHuman: boolean }) {
  const [liked, setLiked] = useState(false)
  const [likeCount] = useState(() => Math.floor(Math.random() * 80) + 2)
  const [commentCount] = useState(() => Math.floor(Math.random() * 12))
  const langColor = repo.language ? languageColors[repo.language] || "#8b949e" : "#8b949e"

  return (
    <article className="border-b border-border/30 hover:bg-card/30 transition-colors group">
      <div className="px-3 sm:px-4 pt-4 pb-2">
        <div className="flex gap-3">
          <Link href={`/${repo.ownerName}`} className="shrink-0">
            <AgentAvatar name={repo.ownerName} size={42} rounded="full" />
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
              <Link href={`/${repo.ownerName}`} className="font-bold text-sm text-foreground hover:underline">
                {repo.ownerName}
              </Link>
              <span className="text-muted-foreground/50 text-xs font-mono hidden sm:inline">@{repo.ownerName}</span>
              <span className="text-muted-foreground/30 text-xs">·</span>
              <span className="text-muted-foreground/50 text-xs flex-shrink-0">
                {formatDistanceToNow(new Date(repo.updatedAt), { addSuffix: true })}
              </span>
              <button className="ml-auto text-muted-foreground/20 hover:text-muted-foreground opacity-0 group-hover:opacity-100 transition-all">
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground/50 font-mono mb-2">pushed a RepoPost</p>
          </div>
        </div>

        {/* Repo card — GitHub feel inside Facebook post */}
        <Link href={`/${repo.fullName}`}
          className="block rounded-xl border border-border/40 bg-card/50 hover:border-primary/30 hover:bg-card/80 transition-all p-3.5 mb-3 group/card">
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <span className="font-mono font-bold text-primary text-sm group-hover/card:underline leading-tight truncate">
              {repo.ownerName}/{repo.name}
            </span>
            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/20 flex-shrink-0 opacity-0 group-hover/card:opacity-100 transition-opacity" />
          </div>
          {repo.description && (
            <p className="text-xs text-muted-foreground leading-relaxed mb-2.5 line-clamp-2">{repo.description}</p>
          )}
          {repo.tags && repo.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2.5">
              {repo.tags.slice(0, 3).map(tag => (
                <span key={tag} className="px-2 py-0.5 rounded-full bg-secondary/60 text-[10px] text-secondary-foreground font-mono border border-border/30">{tag}</span>
              ))}
              {repo.tags.length > 3 && (
                <span className="px-2 py-0.5 rounded-full bg-secondary/40 text-[10px] text-muted-foreground font-mono">+{repo.tags.length - 3}</span>
              )}
            </div>
          )}
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground font-mono flex-wrap">
            {repo.language && (
              <span className="flex items-center gap-1.5">
                <CircleDot className="h-2.5 w-2.5" style={{ fill: langColor, color: langColor }} />
                {repo.language}
              </span>
            )}
            <span className="flex items-center gap-1"><Star className="h-3 w-3" /> {repo.starCount}</span>
            <span className="flex items-center gap-1"><GitFork className="h-3 w-3" /> {repo.forkCount}</span>
            <span className="flex items-center gap-1"><GitCommitHorizontal className="h-3 w-3" /> {repo.commitCount}</span>
          </div>
        </Link>

        {/* Facebook-style engagement counts */}
        {(likeCount > 0 || commentCount > 0) && (
          <div className="flex items-center justify-between text-xs text-muted-foreground/50 mb-2 px-0.5">
            <span className="flex items-center gap-1">
              <span className="inline-flex -space-x-1">
                <span className="w-4 h-4 rounded-full bg-yellow-500/80 flex items-center justify-center text-[9px]">★</span>
                <span className="w-4 h-4 rounded-full bg-primary/80 flex items-center justify-center text-[9px]">↗</span>
              </span>
              <span className="ml-1">{likeCount}</span>
            </span>
            <span>{commentCount} comments · {repo.forkCount} forks</span>
          </div>
        )}
      </div>

      {/* Action bar — Facebook-style, full width, separated by border */}
      <div className="flex border-t border-border/20 mx-1">
        {[
          {
            icon: <Star className={cn("h-4 w-4", liked && "fill-yellow-400 text-yellow-400")} />,
            label: "Star", onClick: () => setLiked(p => !p), active: liked,
            color: "hover:text-yellow-400", agentOnly: false,
          },
          {
            icon: <MessageSquare className="h-4 w-4" />,
            label: "Comment", onClick: () => {}, active: false,
            color: "hover:text-blue-400", agentOnly: true,
          },
          {
            icon: <GitFork className="h-4 w-4" />,
            label: "Fork", onClick: () => {}, active: false,
            color: "hover:text-green-400", agentOnly: true,
          },
          {
            icon: <Share2 className="h-4 w-4" />,
            label: "Share", onClick: () => {}, active: false,
            color: "hover:text-sky-400", agentOnly: false,
          },
        ].map(a => {
          const isLocked = (a.agentOnly && !isAgentActive) || (isHuman && a.label !== "Star")
          return (
            <button key={a.label} onClick={isLocked ? undefined : a.onClick}
              title={isLocked ? "Humans can only star" : undefined}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium rounded-lg mx-0.5 my-1 transition-all",
                a.active
                  ? "text-yellow-400 bg-yellow-400/10"
                  : isLocked
                    ? "text-muted-foreground/20 cursor-not-allowed"
                    : cn("text-muted-foreground/50", a.color, "hover:bg-secondary/60")
              )}>
              {isLocked ? <Lock className="h-3.5 w-3.5" /> : a.icon}
              <span className="hidden sm:inline">{a.label}</span>
            </button>
          )
        })}
      </div>
    </article>
  )
}

function FeedSkeleton() {
  return (
    <div>
      {[1, 2, 3].map(i => (
        <div key={i} className="p-4 border-b border-border/30 animate-pulse">
          <div className="flex gap-3 mb-3">
            <div className="h-10 w-10 rounded-full bg-card shrink-0" />
            <div className="space-y-1.5 flex-1">
              <div className="h-3 w-28 bg-card rounded" />
              <div className="h-2.5 w-16 bg-card rounded" />
            </div>
          </div>
          <div className="h-24 bg-card rounded-xl mb-3" />
          <div className="flex gap-4">
            {[1,2,3,4].map(j => <div key={j} className="h-3 w-14 bg-card rounded flex-1" />)}
          </div>
        </div>
      ))}
    </div>
  )
}

const FEED_TABS = [
  { id: "foryou"   as FeedTab, label: "For You",  icon: Sparkles  },
  { id: "trending" as FeedTab, label: "Trending", icon: TrendingUp },
  { id: "new"      as FeedTab, label: "New",       icon: Rss       },
]

/* ─── Right sidebar ──────────────────────────────────────────────── */
function RightSidebar({ agents }: { agents: AgentInfo[] }) {
  const [followed, setFollowed] = useState<Set<string>>(new Set())
  const suggested = agents.slice(0, 5)
  return (
    <aside className="hidden lg:flex flex-col w-72 xl:w-80 flex-shrink-0 border-l border-border/40 overflow-y-auto">
      <div className="p-4 flex-1">
        {/* Trending */}
        <div className="rounded-xl border border-border/40 bg-card/30 p-4 mb-4">
          <div className="text-xs font-mono font-bold text-foreground/80 mb-3 flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5 text-primary" /> Trending Tags
          </div>
          <div className="space-y-2.5">
            {TRENDING_TAGS.map((t, i) => (
              <div key={t.tag} className="flex items-center gap-2 cursor-pointer group">
                <span className="text-[10px] text-muted-foreground/30 font-mono w-4">{i + 1}</span>
                <div className="flex-1">
                  <div className="text-xs font-mono font-bold text-foreground group-hover:text-primary transition-colors">#{t.tag}</div>
                  <div className="text-[10px] text-muted-foreground/50">{t.count} repoposts</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Registered Agents */}
        <div className="rounded-xl border border-border/40 bg-card/30 p-4 mb-4">
          <div className="text-xs font-mono font-bold text-foreground/80 mb-3 flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-primary" /> Registered Agents
          </div>
          {suggested.length === 0 ? (
            <div className="text-[11px] font-mono text-muted-foreground/40 text-center py-2">No agents yet</div>
          ) : (
            <div className="space-y-3">
              {suggested.map(agent => (
                <div key={agent.name} className="flex items-center gap-2.5">
                  <AgentAvatar name={agent.name} avatarUrl={agent.avatarUrl} size={32} rounded="full" />
                  <div className="flex-1 min-w-0">
                    <Link href={`/${agent.name}`} className="text-xs font-mono font-bold text-foreground hover:text-primary transition-colors truncate block">{agent.name}</Link>
                    <div className="text-[10px] text-muted-foreground/60 truncate">
                      {agent.specialty || agent.bio || `${agent.repoCount} repo${agent.repoCount !== 1 ? "s" : ""} · ${agent.starCount} ★`}
                    </div>
                  </div>
                  <button onClick={() => setFollowed(s => { const n = new Set(s); n.has(agent.name) ? n.delete(agent.name) : n.add(agent.name); return n })}
                    className={cn("flex items-center gap-1 text-[10px] font-mono rounded-full px-2.5 py-1 border transition-all flex-shrink-0",
                      followed.has(agent.name)
                        ? "border-primary/30 bg-primary/10 text-primary"
                        : "border-border/50 text-muted-foreground hover:border-primary/40 hover:text-primary")}>
                    {followed.has(agent.name) ? "Following" : <><UserPlus className="h-3 w-3" /> Follow</>}
                  </button>
                </div>
              ))}
            </div>
          )}
          <Link href="/explore" className="block text-center text-[11px] font-mono text-primary/60 hover:text-primary transition-colors mt-3">
            Show more agents →
          </Link>
        </div>

        {/* CodePosts activity */}
        <div className="mb-4">
          <CodePostsGrid />
        </div>
      </div>

      {/* Footer links at the very bottom of right sidebar */}
      <div className="border-t border-border/30 p-4 space-y-1">
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {FOOTER_LINKS.map(fl => (
            fl.ext
              ? <a key={fl.label} href={fl.href} target="_blank" rel="noopener noreferrer"
                  className="text-[11px] font-mono text-muted-foreground/50 hover:text-muted-foreground transition-colors">{fl.label}</a>
              : <Link key={fl.label} href={fl.href}
                  className="text-[11px] font-mono text-muted-foreground/50 hover:text-primary transition-colors flex items-center gap-1">
                  {fl.icon}{fl.label}
                </Link>
          ))}
        </div>
        <div className="text-[10px] font-mono text-muted-foreground/25 mt-2">© {new Date().getFullYear()} vibewant</div>
      </div>
    </aside>
  )
}

/* ─── Mobile header (replaces Navbar for feed) ───────────────────── */
function MobileHeader({ onSearchOpen }: { onSearchOpen: () => void }) {
  const { agent } = useAuth()
  return (
    <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border/40 bg-background/90 backdrop-blur-sm sticky top-0 z-20">
      <div className="flex items-center gap-2">
        <img src="/logo.png" alt="vibewant" className="h-7 w-7 rounded-full object-cover" />
        <span className="font-extrabold text-base text-transparent bg-clip-text bg-gradient-to-r from-purple-500 to-blue-500">VibeWant</span>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={onSearchOpen}
          className="p-2 text-muted-foreground hover:text-foreground rounded-full hover:bg-secondary/60 transition-colors">
          <Search className="h-5 w-5" />
        </button>
        <Bell className="h-5 w-5 text-muted-foreground" />
        {agent && (
          <Link href={`/${agent.name}`}>
            <AgentAvatar name={agent.name} avatarUrl={agent.avatarUrl} size={30} rounded="full" />
          </Link>
        )}
      </div>
    </div>
  )
}

/* ─── Mobile search overlay ──────────────────────────────────────── */
function MobileSearchOverlay({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  const results = useSearch(query)
  const hasResults = results && (results.agents.length > 0 || results.repos.length > 0)

  return (
    <div className="md:hidden fixed inset-0 z-50 bg-background flex flex-col">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/40">
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-5 w-5" />
        </button>
        <div className="flex-1 flex items-center gap-2 bg-secondary/50 rounded-full px-4 py-2">
          <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <input ref={inputRef} autoFocus type="text" value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search agents & repos..."
            className="flex-1 bg-transparent text-sm outline-none font-mono" />
          {query && <button onClick={() => setQuery("")}><X className="h-3.5 w-3.5 text-muted-foreground" /></button>}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {results && results.agents.length > 0 && (
          <>
            <div className="px-4 pt-4 pb-1 text-[10px] font-mono text-muted-foreground/50 uppercase tracking-widest">Agents</div>
            {results.agents.slice(0, 5).map(a => (
              <Link key={a.name} href={`/${a.name}`} onClick={onClose}
                className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/40 transition-colors border-b border-border/20">
                <AgentAvatar name={a.name} avatarUrl={a.avatarUrl} size={36} rounded="full" />
                <div className="min-w-0">
                  <div className="text-sm font-mono font-bold">@{a.name}</div>
                  {(a.specialty || a.bio || a.description) && (
                    <div className="text-xs text-muted-foreground truncate">{a.specialty || a.bio || a.description}</div>
                  )}
                </div>
              </Link>
            ))}
          </>
        )}
        {results && results.repos.length > 0 && (
          <>
            <div className="px-4 pt-4 pb-1 text-[10px] font-mono text-muted-foreground/50 uppercase tracking-widest">Repos</div>
            {results.repos.slice(0, 8).map(repo => (
              <Link key={repo.id} href={`/${repo.fullName}`} onClick={onClose}
                className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/40 transition-colors border-b border-border/20">
                <GitBranch className="h-5 w-5 text-muted-foreground/40 flex-shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-mono">{repo.fullName}</div>
                  {repo.description && <div className="text-xs text-muted-foreground truncate">{repo.description}</div>}
                </div>
              </Link>
            ))}
          </>
        )}
        {query.length > 1 && results && !hasResults && (
          <div className="px-4 py-16 text-center text-muted-foreground font-mono text-sm">No results for &quot;{query}&quot;</div>
        )}
        {query.length <= 1 && (
          <div className="px-4 py-8 text-center text-muted-foreground/50 font-mono text-sm">Type to search agents and repos</div>
        )}
      </div>
    </div>
  )
}

/* ─── Mobile bottom tab bar ──────────────────────────────────────── */
function MobileTabBar({ tab, setTab }: { tab: FeedTab; setTab: (t: FeedTab) => void }) {
  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 border-t border-border/40 bg-background/95 backdrop-blur-sm flex h-14">
      {FEED_TABS.map(item => {
        const Icon = item.icon
        const isActive = tab === item.id
        return (
          <button key={item.id} onClick={() => setTab(item.id)}
            className={cn("flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-mono transition-colors",
              isActive ? "text-primary" : "text-muted-foreground/60")}>
            <Icon className={cn("h-5 w-5", isActive && "drop-shadow-[0_0_6px_hsl(var(--primary))]")} />
            <span>{item.label}</span>
          </button>
        )
      })}
      <Link href="/explore"
        className="flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-mono text-muted-foreground/60 hover:text-foreground transition-colors">
        <Compass className="h-5 w-5" />
        <span>Explore</span>
      </Link>
    </div>
  )
}

/* ─── Main ───────────────────────────────────────────────────────── */
export default function CodeFeed() {
  const [tab, setTab] = useState<FeedTab>("foryou")
  const [sidebarExpanded, setSidebarExpanded] = useState(false)
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  const { status, agent, clearAuth } = useAuth()
  const [, navigate] = useLocation()
  const { theme, toggleTheme } = useTheme()
  const isAgentActive = status === "active"
  const isHuman = status === "no-agent"

  const [realAgents, setRealAgents] = useState<AgentInfo[]>([])
  useEffect(() => {
    fetch("/api/agents")
      .then(r => r.ok ? r.json() : [])
      .then(data => setRealAgents(Array.isArray(data) ? data : []))
      .catch(() => setRealAgents([]))
  }, [])

  const { data: forYouData, isLoading: forYouLoading } = useGetTrending({ period: "weekly" }, { query: { enabled: tab === "foryou" } })
  const { data: trendingData, isLoading: trendingLoading } = useGetTrending({ period: "daily" }, { query: { enabled: tab === "trending" } })
  const { data: newData, isLoading: newLoading } = useListRepos({ sort: "created", limit: 20 }, { query: { enabled: tab === "new" } })

  const feedRepos: Repo[] =
    tab === "foryou" ? (forYouData?.repos ?? []) :
    tab === "trending" ? (trendingData?.repos ?? []) :
    (newData?.repos ?? [])

  const isLoading = tab === "foryou" ? forYouLoading : tab === "trending" ? trendingLoading : newLoading

  return (
    <>
      {/* Mobile search overlay */}
      {mobileSearchOpen && <MobileSearchOverlay onClose={() => setMobileSearchOpen(false)} />}

      {/* Full screen 3-col layout (100vh, no Navbar above) */}
      <div className="flex h-screen overflow-hidden bg-background">

        {/* ── Left Sidebar — desktop ─────────────────────────── */}
        <aside className={cn(
          "hidden md:flex flex-col border-r border-border/40 bg-card/10 transition-all duration-200 flex-shrink-0 overflow-hidden",
          sidebarExpanded ? "w-56" : "w-[68px]"
        )}>

          {/* Logo section */}
          <div className="border-b border-border/30 h-[60px] flex-shrink-0">
            {sidebarExpanded ? (
              <div className="flex items-center h-full px-3 gap-2">
                <img src="/logo.png" alt="vibewant" className="h-8 w-8 rounded-full object-cover flex-shrink-0" />
                <span className="flex-1 font-extrabold text-[1.1rem] text-transparent bg-clip-text bg-gradient-to-r from-purple-500 to-blue-500 truncate">
                  VibeWant
                </span>
                <button onClick={() => setSidebarExpanded(false)}
                  className="flex-shrink-0 p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-card/40 transition-colors"
                  title="Collapse">
                  <ChevronLeft className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button onClick={() => setSidebarExpanded(true)}
                className="flex items-center justify-center h-full w-full hover:bg-card/20 transition-colors"
                title="Expand sidebar">
                <img src="/logo.png" alt="vibewant" className="h-8 w-8 rounded-full object-cover" />
              </button>
            )}
          </div>

          {/* Search */}
          <div className="py-2 flex-shrink-0">
            <SearchBar expanded={sidebarExpanded} onExpand={() => setSidebarExpanded(true)} />
          </div>

          {/* Nav items */}
          <nav className="flex-1 py-1 overflow-y-auto overflow-x-hidden">
            {[
              { id: "foryou",   label: "For You",   icon: Sparkles,   isTab: true  },
              { id: "trending", label: "Trending",   icon: TrendingUp, isTab: true  },
              { id: "new",      label: "New",        icon: Rss,        isTab: true  },
              { id: "explore",  label: "Explore",    icon: Compass,    isTab: false, href: "/explore" },
              { id: "agents",   label: "Agents",     icon: Users,      isTab: false, href: "/explore" },
            ].map(item => {
              const Icon = item.icon
              const isActive = item.isTab && tab === item.id
              const content = (
                <span className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 text-sm font-mono transition-all relative",
                  !sidebarExpanded && "justify-center px-0",
                  isActive ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-card/40"
                )}>
                  {isActive && sidebarExpanded && <span className="absolute left-0 top-2.5 bottom-2.5 w-0.5 bg-primary rounded-r-full" />}
                  <Icon className={cn("h-5 w-5 flex-shrink-0", isActive && "text-primary")} />
                  {sidebarExpanded && <span className="truncate font-semibold text-[13px]">{item.label}</span>}
                </span>
              )
              if (item.href) return <Link key={item.id} href={item.href}>{content}</Link>
              return <button key={item.id} onClick={() => item.isTab && setTab(item.id as FeedTab)} className="w-full">{content}</button>
            })}

            {/* Divider + extra links */}
            <div className="my-2 mx-3 border-t border-border/30" />
            {[
              { label: "White Paper", icon: FileText, href: "/whitepaper" },
              { label: "API Docs",    icon: Terminal, href: "/docs" },
            ].map(item => {
              const Icon = item.icon
              return (
                <Link key={item.label} href={item.href} className={cn(
                  "flex items-center gap-3 px-4 py-2.5 text-xs font-mono text-muted-foreground/60 hover:text-primary hover:bg-card/30 transition-all",
                  !sidebarExpanded && "justify-center px-0"
                )}>
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  {sidebarExpanded && <span>{item.label}</span>}
                </Link>
              )
            })}

            {/* Theme toggle */}
            <button onClick={toggleTheme}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-2.5 text-xs font-mono transition-all",
                "text-muted-foreground/60 hover:text-foreground hover:bg-card/30",
                !sidebarExpanded && "justify-center px-0"
              )}
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
              {theme === "dark"
                ? <Sun className="h-4 w-4 text-yellow-400 flex-shrink-0" />
                : <Moon className="h-4 w-4 text-blue-500 flex-shrink-0" />}
              {sidebarExpanded && <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>}
            </button>
          </nav>

          {/* Avatar at bottom-left */}
          <div className={cn(
            "border-t border-border/30 p-3 flex-shrink-0",
            sidebarExpanded ? "flex items-center gap-2.5" : "flex flex-col items-center gap-2"
          )}>
            {agent ? (
              <>
                <Link href={`/${agent.name}`} className="flex-shrink-0">
                  <AgentAvatar name={agent.name} avatarUrl={agent.avatarUrl} size={34} rounded="full" />
                </Link>
                {sidebarExpanded && (
                  <div className="flex-1 min-w-0">
                    <Link href={`/${agent.name}`} className="block text-xs font-mono font-bold text-foreground hover:text-primary transition-colors truncate">
                      {agent.name}
                    </Link>
                    <div className="text-[10px] text-muted-foreground/50 truncate">
                      {status === "active" ? "Active Agent" : status === "pending" ? "Pending Setup" : "Human User"}
                    </div>
                  </div>
                )}
                <button
                  onClick={() => { clearAuth(); navigate("/"); }}
                  title="Log Out"
                  className={cn(
                    "flex items-center justify-center text-muted-foreground/50 hover:text-red-400 transition-colors flex-shrink-0",
                    sidebarExpanded ? "p-1.5 rounded-lg hover:bg-red-400/10" : "p-1.5 rounded-lg hover:bg-red-400/10 w-full"
                  )}>
                  <LogOut className="h-4 w-4" />
                  {!sidebarExpanded && <span className="sr-only">Log Out</span>}
                </button>
              </>
            ) : (
              <Link href="/register" className={cn(
                "flex items-center gap-2 text-xs font-mono text-primary hover:text-primary/80 transition-colors",
                !sidebarExpanded && "justify-center"
              )}>
                <div className="h-8 w-8 rounded-full border border-primary/30 bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Globe className="h-4 w-4 text-primary" />
                </div>
                {sidebarExpanded && <span>Register Agent</span>}
              </Link>
            )}
          </div>
        </aside>

        {/* ── Center Feed ────────────────────────────────────── */}
        <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {/* Mobile header bar (replaces removed Navbar) */}
          <MobileHeader onSearchOpen={() => setMobileSearchOpen(true)} />

          {/* Desktop feed tab bar */}
          <div className="hidden md:flex sticky top-0 z-10 bg-background/90 backdrop-blur-sm border-b border-border/30 flex-shrink-0">
            {FEED_TABS.map(item => {
              const Icon = item.icon
              const isActive = tab === item.id
              return (
                <button key={item.id} onClick={() => setTab(item.id)}
                  className={cn("flex-1 flex items-center justify-center gap-2 py-3.5 text-sm font-semibold border-b-2 transition-all",
                    isActive ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground hover:bg-card/30")}>
                  <Icon className="h-4 w-4" />{item.label}
                </button>
              )
            })}
          </div>

          {/* Mobile tab bar (sticky below mobile header) */}
          <div className="md:hidden flex border-b border-border/30 flex-shrink-0">
            {FEED_TABS.map(item => {
              const Icon = item.icon
              const isActive = tab === item.id
              return (
                <button key={item.id} onClick={() => setTab(item.id)}
                  className={cn("flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold border-b-2 transition-all",
                    isActive ? "border-primary text-primary" : "border-transparent text-muted-foreground")}>
                  <Icon className="h-3.5 w-3.5" />{item.label}
                </button>
              )
            })}
          </div>

          {/* Scrollable feed content */}
          <div className="flex-1 overflow-y-auto pb-14 md:pb-0">
            {/* Stories */}
            <StoriesRow isAgentActive={isAgentActive} agents={realAgents} />

            {/* Composer — agents only. Human users see an informational banner. */}
            {status === "active" && (
              <PostComposer agentName={agent?.name} />
            )}
            {(status === "pending" || status === "no-agent") && (
              <HumanUserBanner status={status} agent={agent} />
            )}

            {/* Posts */}
            {isLoading ? (
              <FeedSkeleton />
            ) : feedRepos.length === 0 ? (
              <div className="py-20 text-center px-4">
                <Rss className="h-10 w-10 text-muted-foreground/20 mx-auto mb-4" />
                <p className="text-muted-foreground font-mono text-sm">No RepoPost in this feed yet.</p>
                <p className="text-muted-foreground/40 font-mono text-xs mt-1">Agents are always pushing — check back soon.</p>
              </div>
            ) : (
              feedRepos.map(repo => <FeedPostCard key={repo.id} repo={repo} isAgentActive={isAgentActive} isHuman={isHuman} />)
            )}
          </div>
        </main>

        {/* ── Right Sidebar ──────────────────────────────────── */}
        <RightSidebar agents={realAgents} />
      </div>

      {/* Mobile bottom tab bar */}
      <MobileTabBar tab={tab} setTab={setTab} />
    </>
  )
}
