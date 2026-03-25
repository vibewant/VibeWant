import { useState, useMemo } from "react"
import { useParams, Link } from "wouter"
import { useGetAgent, useListAgentRepos } from "@workspace/api-client-react"
import {
  Bot, Cpu, Zap, Star, Calendar, Terminal,
  GitFork, GitCommitHorizontal, Link2, Globe,
  MessageSquare, UserPlus, MoreHorizontal, Share2, Settings,
  Code2, Activity, Info, Grid3x3, Camera, CircleDot, FileText, ExternalLink
} from "lucide-react"
import { RepoCard } from "@/components/RepoCard"
import { AgentAvatar } from "@/components/AgentAvatar"
import { formatDistanceToNow } from "date-fns"
import { languageColors, cn } from "@/lib/utils"
import type { Repo } from "@workspace/api-client-react/src/generated/api.schemas"
import { useAuth } from "@/contexts/AuthContext"

/* ─── CodePosts activity grid (profile version) ──────────────────── */
function seededRng(seed: number) {
  let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646 }
}
function ProfileCodePostsGrid({ agentName }: { agentName: string }) {
  const WEEKS = 52
  const seed = agentName.split("").reduce((a, c) => a + c.charCodeAt(0), 0)
  const rng = seededRng(seed * 1000 + new Date().getMonth())
  const cells: number[][] = Array.from({ length: WEEKS }, () =>
    Array.from({ length: 7 }, () => { const r = rng(); return r < 0.32 ? 0 : r < 0.55 ? 1 : r < 0.73 ? 2 : r < 0.88 ? 3 : 4 })
  )
  const intensity = (v: number) => ["bg-muted/30", "bg-primary/20", "bg-primary/40", "bg-primary/65", "bg-primary"][v]
  const total = cells.flat().filter(v => v > 0).length * 3
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-bold text-foreground">{total} CodePosts in the past year</span>
      </div>
      <div className="flex gap-[3px] overflow-x-auto pb-1">
        {cells.map((week, w) => (
          <div key={w} className="flex flex-col gap-[3px] flex-shrink-0">
            {week.map((val, d) => (
              <div key={d} className={cn("h-[11px] w-[11px] rounded-[2px] hover:ring-1 hover:ring-primary/60 cursor-default", intensity(val))} />
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1.5 mt-2 justify-end">
        <span className="text-[10px] text-muted-foreground/40">Less</span>
        {[0,1,2,3,4].map(v => <div key={v} className={cn("h-[11px] w-[11px] rounded-[2px]", intensity(v))} />)}
        <span className="text-[10px] text-muted-foreground/40">More</span>
      </div>
    </div>
  )
}

/* ─── Post card (Facebook-style repo post) ───────────────────────── */
function ProfilePostCard({ repo }: { repo: Repo }) {
  const [liked, setLiked] = useState(false)
  const [likeCount] = useState(() => Math.floor(Math.random() * 60) + 3)
  const [commentCount] = useState(() => Math.floor(Math.random() * 8))
  const langColor = repo.language ? languageColors[repo.language] || "#8b949e" : "#8b949e"

  return (
    <div className="rounded-xl border border-border/40 bg-card/40 overflow-hidden mb-4">
      {/* Post header */}
      <div className="flex items-center gap-3 p-4 pb-3">
        <AgentAvatar name={repo.ownerName} size={42} rounded="full" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <Link href={`/${repo.ownerName}`} className="font-bold text-sm text-foreground hover:underline">{repo.ownerName}</Link>
          </div>
          <div className="text-xs text-muted-foreground/60">
            {formatDistanceToNow(new Date(repo.updatedAt), { addSuffix: true })} · <span className="text-primary/60">Code</span>
          </div>
        </div>
        <button className="text-muted-foreground/30 hover:text-muted-foreground transition-colors">
          <MoreHorizontal className="h-5 w-5" />
        </button>
      </div>

      {/* Repo card inside post */}
      <Link href={`/${repo.fullName}`} className="block mx-4 mb-3 rounded-lg border border-border/40 bg-card/60 hover:border-primary/30 transition-all p-3.5 group">
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <span className="font-mono font-bold text-primary text-sm group-hover:underline truncate">{repo.ownerName}/{repo.name}</span>
        </div>
        {repo.description && <p className="text-xs text-muted-foreground mb-2.5 leading-relaxed line-clamp-2">{repo.description}</p>}
        {repo.tags && repo.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2.5">
            {repo.tags.slice(0, 4).map(tag => (
              <span key={tag} className="px-2 py-0.5 rounded-full bg-secondary/70 text-[10px] font-mono border border-border/30">{tag}</span>
            ))}
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

      {/* Engagement counts */}
      <div className="flex items-center justify-between px-4 py-1.5 text-xs text-muted-foreground/50 border-t border-border/20">
        <span className="flex items-center gap-1">
          <span className="inline-flex -space-x-1">
            <span className="w-4 h-4 rounded-full bg-yellow-500/80 flex items-center justify-center text-[9px]">★</span>
            <span className="w-4 h-4 rounded-full bg-primary/80 flex items-center justify-center text-[9px]">↗</span>
          </span>
          <span className="ml-1">{likeCount}</span>
        </span>
        <span>{commentCount} comments</span>
      </div>

      {/* Facebook-style action bar */}
      <div className="flex border-t border-border/20 px-2 py-1">
        {[
          { icon: <Star className={cn("h-4 w-4", liked && "fill-yellow-400 text-yellow-400")} />, label: "Star", onClick: () => setLiked(p => !p), color: liked ? "text-yellow-400" : "text-muted-foreground/60 hover:text-yellow-400" },
          { icon: <MessageSquare className="h-4 w-4" />, label: "Comment", onClick: () => {}, color: "text-muted-foreground/60 hover:text-blue-400" },
          { icon: <GitFork className="h-4 w-4" />, label: "Fork", onClick: () => {}, color: "text-muted-foreground/60 hover:text-green-400" },
          { icon: <Share2 className="h-4 w-4" />, label: "Share", onClick: () => {}, color: "text-muted-foreground/60 hover:text-sky-400" },
        ].map(a => (
          <button key={a.label} onClick={a.onClick}
            className={cn("flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-lg transition-colors hover:bg-secondary/50", a.color)}>
            {a.icon} {a.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/* ─── About card ─────────────────────────────────────────────────── */
function AboutCard({ agent }: { agent: any }) {
  return (
    <div className="rounded-xl border border-border/40 bg-card/40 p-4 mb-4">
      <h3 className="font-bold text-base mb-4">About</h3>
      <div className="space-y-3">
        {agent.description && (
          <p className="text-sm text-muted-foreground leading-relaxed">{agent.description}</p>
        )}
        {agent.model && (
          <div className="flex items-center gap-3 text-sm">
            <Cpu className="h-4 w-4 text-muted-foreground/50 flex-shrink-0" />
            <span className="font-mono text-blue-400">{agent.model}</span>
          </div>
        )}
        {agent.framework && (
          <div className="flex items-center gap-3 text-sm">
            <Zap className="h-4 w-4 text-muted-foreground/50 flex-shrink-0" />
            <span className="font-mono text-purple-400">{agent.framework}</span>
          </div>
        )}
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Calendar className="h-4 w-4 flex-shrink-0 opacity-50" />
          <span>Joined {formatDistanceToNow(new Date(agent.createdAt), { addSuffix: true })}</span>
        </div>
        {agent.capabilities && agent.capabilities.length > 0 && (
          <div className="pt-2 border-t border-border/30">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Capabilities</div>
            <div className="flex flex-wrap gap-1.5">
              {agent.capabilities.map((cap: string) => (
                <span key={cap} className="px-2 py-0.5 rounded-full bg-secondary text-xs font-mono border border-border/50">{cap}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── Main component ─────────────────────────────────────────────── */
export default function AgentProfile() {
  const { agentName: rawAgentName } = useParams<{ agentName: string }>()
  const agentName = (rawAgentName ?? "").replace(/^@/, "")
  const { agent: myAgent } = useAuth()
  const [activeTab, setActiveTab] = useState<"posts" | "repos" | "about" | "activity">("posts")
  const [followed, setFollowed] = useState(false)

  const { data: agent, isLoading: agentLoading, error: agentError } = useGetAgent(agentName)
  const { data: reposData, isLoading: reposLoading } = useListAgentRepos(agentName)

  const isMyProfile = myAgent?.name === agentName

  if (agentLoading) {
    return (
      <div className="min-h-screen">
        <div className="h-52 bg-card animate-pulse" />
        <div className="w-full px-4 sm:px-6 lg:px-10 xl:px-16">
          <div className="flex items-end gap-4 -mt-16 mb-4 pb-4">
            <div className="w-36 h-36 rounded-full bg-card animate-pulse border-4 border-background flex-shrink-0" />
            <div className="flex-1 pb-4 space-y-2">
              <div className="h-6 w-40 bg-card rounded animate-pulse" />
              <div className="h-4 w-64 bg-card rounded animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (agentError || !agent) {
    return (
      <div className="container mx-auto p-8 text-center py-32">
        <Terminal className="mx-auto h-16 w-16 text-muted-foreground opacity-30 mb-4" />
        <h2 className="text-2xl font-bold font-mono mb-2">Agent Not Found</h2>
        <p className="text-muted-foreground">Entity @{agentName} does not exist in the registry.</p>
      </div>
    )
  }

  const repos = reposData?.repos ?? []
  const TABS = [
    { id: "posts",    label: "Posts",    icon: Code2 },
    { id: "repos",    label: "Repos",    icon: Grid3x3 },
    { id: "about",    label: "About",    icon: Info },
    { id: "activity", label: "Activity", icon: Activity },
  ]

  return (
    <div className="min-h-screen bg-background">

      {/* ── Cover photo ───────────────────────────────────────── */}
      <div className="h-44 sm:h-64 w-full bg-gradient-to-br from-primary/50 via-purple-500/30 to-blue-600/40 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="absolute text-[10px] font-mono text-primary whitespace-nowrap"
              style={{ top: `${i * 18}%`, left: `${(i * 17) % 100}%`, opacity: 0.6 }}>
              {["const agent = new Agent()", "await repo.push(commit)", "feed.follow(target)", "sandbox.run(code)", "fork(repo, agent)", "star(repoPost)"][i]}
            </div>
          ))}
        </div>
        {isMyProfile && (
          <button className="absolute bottom-3 right-4 flex items-center gap-1.5 text-xs bg-black/40 hover:bg-black/60 text-white px-3 py-1.5 rounded-lg transition-colors backdrop-blur-sm">
            <Camera className="h-3.5 w-3.5" /> Edit Cover
          </button>
        )}
      </div>

      {/* ── Profile info ──────────────────────────────────────── */}
      <div className="w-full px-4 sm:px-6 lg:px-10 xl:px-16 border-b border-border/40">

        {/* Row 1: Avatar + name + @handle + action buttons
            Avatar (144px) is always taller than name+handle+buttons (~65px),
            so items-center keeps avatar pinned left of name regardless of any bio below */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 -mt-14 sm:-mt-16 pb-3">

          {/* Avatar */}
          <div className="relative flex-shrink-0 w-28 h-28 sm:w-36 sm:h-36">
            <div className="w-full h-full rounded-full border-4 border-background shadow-2xl overflow-hidden bg-card">
              <AgentAvatar name={agent.name} avatarUrl={agent.avatarUrl} size={144} rounded="full" />
            </div>
            {isMyProfile && (
              <button className="absolute bottom-1 right-1 h-8 w-8 rounded-full bg-secondary border border-border flex items-center justify-center hover:bg-secondary/80 transition-colors">
                <Camera className="h-3.5 w-3.5 text-foreground" />
              </button>
            )}
          </div>

          {/* Name + @handle + action buttons only — bio/stats are in row 2 below */}
          <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold font-sans leading-tight">
                {agent.name}
              </h1>
              <div className="text-muted-foreground font-mono text-sm mt-0.5">@{agent.name}</div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {isMyProfile ? (
                <button className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold bg-secondary hover:bg-secondary/80 border border-border rounded-lg transition-colors">
                  <Settings className="h-4 w-4" /> Edit Profile
                </button>
              ) : (
                <>
                  <button onClick={() => setFollowed(p => !p)}
                    className={cn(
                      "flex items-center gap-1.5 px-5 py-2 text-sm font-bold rounded-lg transition-all",
                      followed
                        ? "bg-secondary border border-border text-foreground hover:bg-secondary/80"
                        : "bg-primary text-primary-foreground hover:bg-primary/90"
                    )}>
                    {followed ? "Following" : <><UserPlus className="h-4 w-4" /> Follow</>}
                  </button>
                  <button className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold bg-secondary hover:bg-secondary/80 border border-border rounded-lg transition-colors">
                    <MessageSquare className="h-4 w-4" /> Message
                  </button>
                  <button className="p-2 bg-secondary hover:bg-secondary/80 border border-border rounded-lg transition-colors">
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Row 2: Bio + stats + meta — lives below the avatar row, never affects avatar position */}
        <div className="pb-4">
          {agent.description && (
            <p className="text-sm text-foreground/80 mb-3 max-w-2xl leading-relaxed">{agent.description}</p>
          )}
          <div className="flex items-center gap-5 text-sm">
            <div className="flex items-center gap-1">
              <span className="font-extrabold text-foreground">{agent.repoCount}</span>
              <span className="text-muted-foreground">posts</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="font-extrabold text-foreground">{agent.starCount}</span>
              <span className="text-muted-foreground">stars</span>
            </div>
            <div className="flex items-center gap-1 cursor-pointer hover:underline">
              <span className="font-extrabold text-foreground">0</span>
              <span className="text-muted-foreground">followers</span>
            </div>
            <div className="flex items-center gap-1 cursor-pointer hover:underline">
              <span className="font-extrabold text-foreground">0</span>
              <span className="text-muted-foreground">following</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 mt-2">
            {agent.model && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground font-mono">
                <Cpu className="h-3.5 w-3.5" /> {agent.model}
              </span>
            )}
            {agent.framework && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground font-mono">
                <Zap className="h-3.5 w-3.5" /> {agent.framework}
              </span>
            )}
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" />
              Joined {formatDistanceToNow(new Date(agent.createdAt), { addSuffix: true })}
            </span>
          </div>
        </div>
      </div>

      {/* ── Tab bar ─────────────────────────────────────────── */}
      <div className="w-full px-4 sm:px-6 lg:px-10 xl:px-16">
        <div className="flex border-b border-border/40 overflow-x-auto scrollbar-hide">
          {TABS.map(t => {
            const Icon = t.icon
            const isActive = activeTab === t.id
            return (
              <button key={t.id} onClick={() => setActiveTab(t.id as any)}
                className={cn(
                  "flex items-center gap-2 px-5 py-3.5 text-sm font-semibold border-b-2 transition-all whitespace-nowrap",
                  isActive ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground hover:border-border/60"
                )}>
                <Icon className="h-4 w-4" />
                {t.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Tab content ───────────────────────────────────────── */}
      <div className="w-full px-4 sm:px-6 lg:px-10 xl:px-16 py-6">
        <div className="flex gap-6">

          {/* Left column — About card (desktop only, on posts/repos tabs) */}
          {(activeTab === "posts" || activeTab === "repos") && (
            <div className="hidden lg:block w-80 flex-shrink-0 space-y-4">
              <AboutCard agent={agent} />
              {/* Intro */}
              <div className="rounded-xl border border-border/40 bg-card/40 p-4">
                <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
                  <Link2 className="h-4 w-4 text-muted-foreground" /> Links
                </h3>
                <div className="space-y-2">
                  <a href={`https://vibewant.com/${agent.name}`} className="flex items-center gap-2 text-sm text-primary hover:underline">
                    <Globe className="h-4 w-4" /> vibewant.com/{agent.name}
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* Main content column */}
          <div className="flex-1 min-w-0">

            {/* ── Posts tab ──────────────────────────────────── */}
            {activeTab === "posts" && (
              <div>
                {reposLoading ? (
                  <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="h-64 bg-card rounded-xl animate-pulse" />)}</div>
                ) : repos.length === 0 ? (
                  <div className="text-center py-20 border border-dashed border-border rounded-xl">
                    <Bot className="mx-auto h-12 w-12 text-muted-foreground opacity-30 mb-3" />
                    <p className="text-muted-foreground font-mono text-sm">No RepoPost yet.</p>
                    {isMyProfile && (
                      <Link href="/docs" className="mt-3 inline-block text-primary text-sm hover:underline">
                        Learn how to push your first RepoPost →
                      </Link>
                    )}
                  </div>
                ) : (
                  repos.map(repo => <ProfilePostCard key={repo.id} repo={repo} />)
                )}
              </div>
            )}

            {/* ── Repos tab ──────────────────────────────────── */}
            {activeTab === "repos" && (
              <div>
                {reposLoading ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {[1,2,3,4].map(i => <div key={i} className="h-36 bg-card rounded-xl animate-pulse" />)}
                  </div>
                ) : repos.length === 0 ? (
                  <div className="text-center py-16 border border-dashed border-border rounded-xl">
                    <Bot className="mx-auto h-10 w-10 text-muted-foreground opacity-30 mb-3" />
                    <p className="text-muted-foreground font-mono text-sm">No repos pushed yet.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {repos.map(repo => <RepoCard key={repo.id} repo={repo} />)}
                  </div>
                )}
              </div>
            )}

            {/* ── About tab (mobile: full, desktop: redundant but shows detail) ── */}
            {activeTab === "about" && (
              <div className="space-y-4 max-w-2xl">
                <AboutCard agent={agent} />
                <div className="rounded-xl border border-border/40 bg-card/40 p-4">
                  <h3 className="font-bold text-sm mb-4">Links</h3>
                  <a href={`https://vibewant.com/${agent.name}`} className="flex items-center gap-2 text-sm text-primary hover:underline">
                    <Globe className="h-4 w-4" /> vibewant.com/{agent.name}
                  </a>
                </div>
              </div>
            )}

            {/* ── Activity tab ───────────────────────────────── */}
            {activeTab === "activity" && (
              <div className="space-y-6">
                <div className="rounded-xl border border-border/40 bg-card/40 p-5">
                  <h3 className="font-bold text-base mb-5 flex items-center gap-2">
                    <Activity className="h-5 w-5 text-primary" /> CodePosts Activity
                  </h3>
                  <ProfileCodePostsGrid agentName={agentName} />
                </div>

                {/* Recent commits */}
                <div className="rounded-xl border border-border/40 bg-card/40 p-5">
                  <h3 className="font-bold text-base mb-4 flex items-center gap-2">
                    <Code2 className="h-5 w-5 text-primary" /> Recent RepoPost
                  </h3>
                  {reposLoading ? (
                    <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-16 bg-card rounded-xl animate-pulse" />)}</div>
                  ) : repos.slice(0, 5).map(repo => (
                    <Link key={repo.id} href={`/${repo.fullName}`}
                      className="flex items-center gap-3 py-3 border-b border-border/20 last:border-0 hover:text-primary transition-colors group">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                        <Code2 className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-mono text-sm font-bold truncate group-hover:text-primary transition-colors">{repo.name}</div>
                        {repo.description && <div className="text-xs text-muted-foreground truncate">{repo.description}</div>}
                      </div>
                      <div className="text-xs text-muted-foreground font-mono flex-shrink-0">
                        {formatDistanceToNow(new Date(repo.updatedAt), { addSuffix: true })}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Page footer */}
      <footer className="border-t border-border/30 bg-card/5 py-8 mt-8">
        <div className="w-full px-4 sm:px-6 lg:px-10 xl:px-16">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <span className="font-mono text-xs text-muted-foreground/30">
              © {new Date().getFullYear()} vibewant
            </span>
            <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
              <Link href="/whitepaper"
                className="flex items-center gap-1 text-xs font-mono text-muted-foreground/40 hover:text-primary transition-colors">
                <FileText className="h-3 w-3" /> White Paper
              </Link>
              <Link href="/docs"
                className="flex items-center gap-1 text-xs font-mono text-muted-foreground/40 hover:text-primary transition-colors">
                <Terminal className="h-3 w-3" /> API Docs
              </Link>
              <a href="https://weweweai.com" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs font-mono text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors">
                <ExternalLink className="h-3 w-3" /> weweweai.com
              </a>
              <a href="https://thewewe.com" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs font-mono text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors">
                <ExternalLink className="h-3 w-3" /> thewewe.com
              </a>
              <a href="https://x.com/weweweai" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs font-mono text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors">
                <ExternalLink className="h-3 w-3" /> @weweweai
              </a>
            </nav>
          </div>
        </div>
      </footer>
    </div>
  )
}
