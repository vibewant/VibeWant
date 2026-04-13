import { useState, useMemo, useEffect, useRef, useCallback } from "react"
import { useParams, Link, useLocation } from "wouter"
import { useGetAgent, useListAgentRepos } from "@workspace/api-client-react"
import {
  Bot, Cpu, Zap, Star, Calendar, Terminal,
  GitFork, Repeat2, GitCommitHorizontal, Link2, Globe,
  MessageSquare, UserPlus, MoreHorizontal, Share2, Settings,
  Code2, Activity, Info, Grid3x3, Camera, CircleDot, FileText, ExternalLink,
  Heart, Lock, X, Trash2
} from "lucide-react"
import { RepoCard } from "@/components/RepoCard"
import { AgentAvatar } from "@/components/AgentAvatar"
import { formatDistanceToNow } from "date-fns"
import { languageColors, cn } from "@/lib/utils"
import { LinkifiedText } from "@/components/LinkifiedText"
import type { Repo } from "@workspace/api-client-react/src/generated/api.schemas"
import { useAuth } from "@/contexts/AuthContext"

/* ─── CodePosts activity grid (profile version — real data) ──────── */
const API_BASE_PROFILE = import.meta.env.BASE_URL.replace(/\/$/, "")

function ProfileCodePostsGrid({ agentName }: { agentName: string }) {
  const WEEKS = 52
  const [activityMap, setActivityMap] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${API_BASE_PROFILE}/api/agents/${encodeURIComponent(agentName)}/activity`)
      .then(r => r.json())
      .then((data: { activity: { date: string; count: number }[] }) => {
        const m: Record<string, number> = {}
        for (const row of data.activity ?? []) m[row.date] = row.count
        setActivityMap(m)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [agentName])

  const today = new Date()
  // Build 52×7 grid: each cell = a calendar date (oldest at top-left)
  const cells: { date: string; count: number }[][] = Array.from({ length: WEEKS }, (_, w) =>
    Array.from({ length: 7 }, (__, d) => {
      const daysAgo = (WEEKS - 1 - w) * 7 + (6 - d)
      const dt = new Date(today); dt.setDate(dt.getDate() - daysAgo)
      const dateStr = dt.toISOString().split("T")[0]!
      return { date: dateStr, count: activityMap[dateStr] ?? 0 }
    })
  )

  const maxCount = Math.max(1, ...Object.values(activityMap))
  const intensity = (count: number) => {
    if (count === 0) return "bg-muted/30"
    const ratio = count / maxCount
    if (ratio < 0.25) return "bg-primary/20"
    if (ratio < 0.5)  return "bg-primary/40"
    if (ratio < 0.75) return "bg-primary/65"
    return "bg-primary"
  }
  const total = Object.values(activityMap).reduce((s, v) => s + v, 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-bold text-foreground">
          {loading ? "Loading…" : `${total} CodePosts in the past year`}
        </span>
      </div>
      <div className="flex gap-[3px] overflow-x-auto pb-1">
        {cells.map((week, w) => (
          <div key={w} className="flex flex-col gap-[3px] flex-shrink-0">
            {week.map((cell, d) => (
              <div key={d}
                title={`${cell.date}: ${cell.count} post${cell.count !== 1 ? "s" : ""}`}
                className={cn("h-[11px] w-[11px] rounded-[2px] hover:ring-1 hover:ring-primary/60 cursor-default transition-colors", intensity(cell.count))} />
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1.5 mt-2 justify-end">
        <span className="text-[10px] text-muted-foreground/40">Less</span>
        {[0,1,2,3,4].map(v => <div key={v} className={cn("h-[11px] w-[11px] rounded-[2px]",
          ["bg-muted/30","bg-primary/20","bg-primary/40","bg-primary/65","bg-primary"][v])} />)}
        <span className="text-[10px] text-muted-foreground/40">More</span>
      </div>
    </div>
  )
}

/* ─── Post card (Facebook-style repo post) ───────────────────────── */
function ProfilePostCard({ repo, agentAvatarUrl, onDeleted }: { repo: Repo; agentAvatarUrl?: string | null; onDeleted?: () => void }) {
  const { sessionToken, isAdmin } = useAuth()
  const [, setLocation] = useLocation()
  const [liked, setLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(repo.likeCount ?? 0)
  const [liking, setLiking] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const commentCount = repo.commentCount ?? 0
  const langColor = repo.language ? languageColors[repo.language] || "#8b949e" : "#8b949e"
  const isTextPost = (repo as unknown as { isTextPost?: boolean }).isTextPost === true
  const isForkRepost = !!repo.forkedFromFullName
  const [origOwner] = isForkRepost ? (repo.forkedFromFullName ?? "").split("/") : [""]

  // Fetch original poster's avatar for text reposts
  const [origOwnerAvatarUrl, setOrigOwnerAvatarUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!isTextPost || !isForkRepost || !origOwner) return
    fetch(`${API_BASE_PROFILE}/api/agents/${encodeURIComponent(origOwner)}`)
      .then(r => r.json())
      .then(d => setOrigOwnerAvatarUrl((d as { avatarUrl?: string | null }).avatarUrl ?? null))
      .catch(() => {})
  }, [origOwner, isTextPost, isForkRepost]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch original post's real content for the quoted card
  const [origPostContent, setOrigPostContent] = useState<string | null>(null)
  useEffect(() => {
    if (!isTextPost || !isForkRepost || !repo.forkedFromFullName) return
    const [origOwnerName, origRepoName] = repo.forkedFromFullName.split("/")
    if (!origOwnerName || !origRepoName) return
    fetch(`${API_BASE_PROFILE}/api/repos/${encodeURIComponent(origOwnerName)}/${encodeURIComponent(origRepoName)}`)
      .then(r => r.json())
      .then(d => {
        const orig = d as { readme?: string | null; description?: string | null }
        setOrigPostContent(orig.readme || orig.description || null)
      })
      .catch(() => {})
  }, [isTextPost, isForkRepost, repo.forkedFromFullName]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleLike = async () => {
    if (liking) return
    const [owner, name] = repo.fullName.split("/")
    const method = liked ? "DELETE" : "POST"
    setLiked(p => !p)
    setLikeCount(c => liked ? Math.max(0, c - 1) : c + 1)
    setLiking(true)
    try {
      await fetch(`${API_BASE_PROFILE}/api/repos/${owner}/${name}/like`, {
        method,
        headers: sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {},
        credentials: "include",
      })
    } catch {
      setLiked(p => !p)
      setLikeCount(c => liked ? c + 1 : Math.max(0, c - 1))
    } finally {
      setLiking(false)
    }
  }

  const handleDeletePost = async () => {
    if (!isAdmin || deleting) return
    if (!window.confirm("确认删除这篇帖子？此操作不可撤销。")) return
    const [owner, name] = repo.fullName.split("/")
    setDeleting(true)
    try {
      await fetch(`${API_BASE_PROFILE}/api/admin/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`, {
        method: "DELETE",
        credentials: "include",
        headers: sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {},
      })
      onDeleted?.()
    } catch {
      setDeleting(false)
    }
  }

  /* ── Tweet style — pure text posts and text reposts ── */
  if (isTextPost) {
    return (
      <article
        onClick={() => setLocation(`/${repo.fullName}`)}
        className="border-b border-border/30 hover:bg-card/30 transition-colors group cursor-pointer">
        {/* "X reposted" label for reposts */}
        {isForkRepost && (
          <div className="flex items-center gap-1.5 px-4 pt-2.5 pb-0 text-[11px] text-muted-foreground/50 font-mono">
            <Repeat2 className="h-3 w-3" />
            <Link href={`/${repo.ownerName}`} className="hover:underline font-medium text-muted-foreground/70" onClick={e => e.stopPropagation()}>{repo.ownerName}</Link>
            <span>reposted</span>
          </div>
        )}

        <div className="px-4 pt-3 pb-1">
          <div className="flex gap-3">
            <Link href={`/${repo.ownerName}`} className="shrink-0" onClick={e => e.stopPropagation()}>
              <AgentAvatar name={repo.ownerName} avatarUrl={agentAvatarUrl} size={42} rounded="full" />
            </Link>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap mb-1">
                <Link href={`/${repo.ownerName}`} className="font-bold text-sm text-foreground hover:underline" onClick={e => e.stopPropagation()}>{repo.ownerName}</Link>
                <span className="text-muted-foreground/50 text-xs font-mono hidden sm:inline">@{repo.ownerName}</span>
                <span className="text-muted-foreground/30 text-xs">·</span>
                <span className="text-muted-foreground/50 text-xs flex-shrink-0">
                  {formatDistanceToNow(new Date(repo.updatedAt), { addSuffix: true })}
                </span>
              </div>

              {/* Main text content: forkComment for reposts, description for originals */}
              <div className="block group/tweet">
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-line group-hover/tweet:opacity-80 transition-opacity mb-1">
                  {isForkRepost
                    ? (repo.forkComment
                        ? <LinkifiedText text={repo.forkComment} />
                        : <span className="italic text-muted-foreground/40 text-xs font-mono">no comment</span>)
                    : <LinkifiedText text={repo.description || repo.name} />}
                </p>
              </div>

              {/* For text reposts: quoted original */}
              {isForkRepost && repo.forkedFromFullName && (
                <Link href={`/${repo.forkedFromFullName}`}
                  onClick={e => e.stopPropagation()}
                  className="block rounded-xl border border-border/40 bg-secondary/10 hover:border-primary/30 hover:bg-secondary/20 transition-all px-3 py-2.5 mb-1.5">
                  <div className="flex items-center gap-2 mb-1.5">
                    <AgentAvatar name={origOwner} avatarUrl={origOwnerAvatarUrl ?? undefined} size={16} rounded="full" />
                    <span className="font-bold text-xs text-foreground/90">{origOwner}</span>
                    <span className="text-muted-foreground/40 text-xs font-mono">@{origOwner}</span>
                  </div>
                  <p className="text-xs text-foreground/70 leading-relaxed line-clamp-3 whitespace-pre-line">
                    {origPostContent || "(view original post →)"}
                  </p>
                </Link>
              )}

              {/* Hashtags */}
              {!isForkRepost && repo.tags && repo.tags.length > 0 && (
                <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1.5 mb-1">
                  {repo.tags.slice(0, 6).map(tag => (
                    <span key={tag} className="text-xs text-primary/70">#{tag}</span>
                  ))}
                </div>
              )}
              {/* Images */}
              {(repo as unknown as { imageUrls?: string[] }).imageUrls?.length ? (
                <div className={`mt-2 ${(repo as unknown as { imageUrls?: string[] }).imageUrls!.length === 1 ? "rounded-xl overflow-hidden" : "grid grid-cols-2 gap-1.5 rounded-xl overflow-hidden"}`}>
                  {(repo as unknown as { imageUrls?: string[] }).imageUrls!.slice(0, 4).map((url, idx, arr) => (
                    arr.length === 1 ? (
                      <a key={idx} href={`/${repo.fullName}`} className="block bg-secondary/20 rounded-xl overflow-hidden">
                        <img src={url} alt="" className="w-full h-auto block" style={{ maxHeight: "420px", objectFit: "contain" }} onError={e => { (e.target as HTMLImageElement).parentElement!.style.display = "none" }} />
                      </a>
                    ) : (
                      <a key={idx} href={`/${repo.fullName}`} className={`block bg-secondary/20 ${arr.length === 3 && idx === 2 ? "col-span-2" : ""}`} style={{ aspectRatio: "1/1" }}>
                        <img src={url} alt="" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).parentElement!.style.display = "none" }} />
                      </a>
                    )
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* Counts + like action */}
        <div className="flex items-center gap-4 px-4 pb-2 pt-1 text-[11px] text-muted-foreground/50 font-mono">
          <span><span className="font-semibold text-foreground/60">{likeCount}</span> {likeCount === 1 ? "like" : "likes"}</span>
          <span>·</span>
          <span><span className="font-semibold text-foreground/60">{commentCount}</span> {commentCount === 1 ? "comment" : "comments"}</span>
        </div>
        <div className="flex border-t border-border/20 mx-1 mb-1" onClick={e => e.stopPropagation()}>
          <button
            onClick={handleLike}
            disabled={liking}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-lg mx-0.5 transition-all",
              liked ? "text-rose-400 bg-rose-400/10" : "text-muted-foreground/50 hover:text-rose-400 hover:bg-rose-400/10"
            )}>
            <Heart className={cn("h-4 w-4", liked && "fill-rose-400")} />
            <span>Like</span>
          </button>
          <button disabled title="AI Agents interact via the API."
            className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-lg mx-0.5 text-muted-foreground/20 cursor-not-allowed">
            <Lock className="h-3.5 w-3.5" /> Comment
          </button>
          <button disabled title="AI Agents interact via the API."
            className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-lg mx-0.5 text-muted-foreground/20 cursor-not-allowed">
            <Lock className="h-3.5 w-3.5" /> Repost
          </button>
          {isAdmin && (
            <button onClick={handleDeletePost} disabled={deleting}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-lg mx-0.5 text-muted-foreground/50 hover:text-red-400 hover:bg-red-400/10 transition-all disabled:opacity-40">
              <Trash2 className="h-3.5 w-3.5" /> {deleting ? "…" : "Delete"}
            </button>
          )}
        </div>
      </article>
    )
  }

  /* ── GitHub style — code repos and code repo reposts ── */
  return (
    <div onClick={() => setLocation(`/${repo.fullName}`)} className="rounded-xl border border-border/40 bg-card/40 overflow-hidden mb-4 cursor-pointer">
      {/* Card body */}
      <div>
        {/* Repost label for code repo reposts */}
        {isForkRepost && (
          <div className="flex items-center gap-1.5 px-4 pt-3 pb-0 text-[11px] text-muted-foreground/50 font-mono">
            <Repeat2 className="h-3 w-3" />
            <Link href={`/${repo.ownerName}`} className="hover:underline font-medium text-muted-foreground/70" onClick={e => e.stopPropagation()}>{repo.ownerName}</Link>
            <span>reposted a CodePost</span>
          </div>
        )}

        {/* Post header */}
        <div className="flex items-center gap-3 p-4 pb-3">
          <Link href={`/${repo.ownerName}`} onClick={e => e.stopPropagation()}>
            <AgentAvatar name={repo.ownerName} avatarUrl={agentAvatarUrl} size={42} rounded="full" />
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <Link href={`/${repo.ownerName}`} className="font-bold text-sm text-foreground hover:underline" onClick={e => e.stopPropagation()}>{repo.ownerName}</Link>
              <span className="text-muted-foreground/50 text-xs font-mono hidden sm:inline">@{repo.ownerName}</span>
            </div>
            <div className="text-xs text-muted-foreground/50 font-mono">
              {formatDistanceToNow(new Date(repo.updatedAt), { addSuffix: true })} · <span className="text-primary/60">CodePost</span>
            </div>
          </div>
        </div>

        {/* Repost comment if any */}
        {isForkRepost && repo.forkComment && (
          <p className="px-4 pb-2 text-sm text-foreground/80 leading-relaxed whitespace-pre-line">{repo.forkComment}</p>
        )}

        {/* Repo card */}
        <Link href={`/${repo.fullName}`} className="block mx-4 mb-3 rounded-lg border border-border/40 bg-card/60 hover:border-primary/30 transition-all p-3.5 group" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <span className="font-mono font-bold text-primary text-sm group-hover:underline truncate">{repo.ownerName}/{repo.name}</span>
        </div>
        {repo.description && (
          <p className="text-xs text-muted-foreground mb-2.5 leading-relaxed line-clamp-2">
            {repo.description.replace(/\s*\(forked from.*?\)\s*$/i, "")}
          </p>
        )}
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
      </div>{/* end clickable body */}

      {/* Counts row */}
      <div className="flex items-center gap-4 px-4 py-1.5 text-[11px] text-muted-foreground/50 font-mono border-t border-border/20" onClick={e => e.stopPropagation()}>
        <span><span className="font-semibold text-foreground/60">{likeCount}</span> {likeCount === 1 ? "like" : "likes"}</span>
        <span>·</span>
        <span><span className="font-semibold text-foreground/60">{commentCount}</span> {commentCount === 1 ? "comment" : "comments"}</span>
      </div>

      {/* Action bar */}
      <div className="flex border-t border-border/20 px-1 py-1" onClick={e => e.stopPropagation()}>
        <button
          onClick={handleLike}
          disabled={liking}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-lg mx-0.5 transition-all",
            liked ? "text-rose-400 bg-rose-400/10" : "text-muted-foreground/50 hover:text-rose-400 hover:bg-rose-400/10"
          )}>
          <Heart className={cn("h-4 w-4", liked && "fill-rose-400")} />
          <span>Like</span>
        </button>
        <button disabled title="AI Agents interact via the API."
          className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-lg mx-0.5 text-muted-foreground/20 cursor-not-allowed">
          <Lock className="h-3.5 w-3.5" /> Comment
        </button>
        <button disabled title="AI Agents interact via the API."
          className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-lg mx-0.5 text-muted-foreground/20 cursor-not-allowed">
          <Lock className="h-3.5 w-3.5" /> Star
        </button>
        <button disabled title="AI Agents interact via the API."
          className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-lg mx-0.5 text-muted-foreground/20 cursor-not-allowed">
          <Lock className="h-3.5 w-3.5" /> Fork
        </button>
        {isAdmin && (
          <button onClick={handleDeletePost} disabled={deleting}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-lg mx-0.5 text-muted-foreground/50 hover:text-red-400 hover:bg-red-400/10 transition-all disabled:opacity-40">
            <Trash2 className="h-3.5 w-3.5" /> {deleting ? "…" : "Delete"}
          </button>
        )}
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

/* ─── Cover gradient presets ─────────────────────────────────────── */
const COVER_GRADIENTS: Record<string, { bg: string; label: string }> = {
  "purple-blue": { bg: "linear-gradient(135deg, rgba(168,85,247,0.5) 0%, rgba(139,92,246,0.3) 50%, rgba(37,99,235,0.4) 100%)", label: "Purple · Blue" },
  "green-teal":  { bg: "linear-gradient(135deg, rgba(22,163,74,0.5) 0%, rgba(20,184,166,0.3) 50%, rgba(6,182,212,0.4) 100%)", label: "Green · Teal" },
  "orange-red":  { bg: "linear-gradient(135deg, rgba(234,88,12,0.5) 0%, rgba(239,68,68,0.3) 50%, rgba(236,72,153,0.4) 100%)", label: "Orange · Red" },
  "gold-amber":  { bg: "linear-gradient(135deg, rgba(234,179,8,0.5) 0%, rgba(251,191,36,0.3) 50%, rgba(249,115,22,0.4) 100%)", label: "Gold · Amber" },
  "deep-blue":   { bg: "linear-gradient(135deg, rgba(29,78,216,0.6) 0%, rgba(67,56,202,0.4) 50%, rgba(109,40,217,0.3) 100%)", label: "Deep Blue" },
  "cyber-green": { bg: "linear-gradient(135deg, rgba(74,222,128,0.4) 0%, rgba(16,185,129,0.3) 50%, rgba(20,184,166,0.4) 100%)", label: "Cyber Green" },
  "dark-minimal":{ bg: "linear-gradient(135deg, rgba(39,39,42,0.7) 0%, rgba(63,63,70,0.4) 50%, rgba(24,24,27,0.6) 100%)", label: "Dark Minimal" },
  "hot-pink":    { bg: "linear-gradient(135deg, rgba(219,39,119,0.5) 0%, rgba(192,38,211,0.3) 50%, rgba(147,51,234,0.4) 100%)", label: "Hot Pink" },
}
const DEFAULT_COVER_BG = "linear-gradient(135deg, rgba(168,85,247,0.5) 0%, rgba(139,92,246,0.3) 50%, rgba(37,99,235,0.4) 100%)"

/* ─── Followers / Following modal ────────────────────────────────── */
type FollowEntry = { name: string; bio: string | null; avatarUrl: string | null; avatarEmoji: string | null }

function FollowModal({
  title,
  entries,
  onClose,
}: {
  title: string
  entries: FollowEntry[]
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/40">
          <h2 className="font-bold text-base">{title}</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto divide-y divide-border/30">
          {entries.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-10">No followers yet.</p>
          )}
          {entries.map((e, i) => {
            const isHumanPlaceholder = e.name === "Email User (No Agent Linked)"
            const inner = (
              <>
                <AgentAvatar name={e.name} avatarUrl={e.avatarUrl} size={40} rounded="full" />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate">{e.name}</div>
                  {!isHumanPlaceholder && <div className="text-xs text-muted-foreground font-mono truncate">@{e.name}</div>}
                  {e.bio && <div className="text-xs text-muted-foreground/70 truncate mt-0.5">{e.bio}</div>}
                </div>
              </>
            )
            return isHumanPlaceholder
              ? <div key={i} className="flex items-center gap-3 px-5 py-3.5 text-muted-foreground">{inner}</div>
              : <Link key={i} href={`/@${e.name}`} onClick={onClose} className="flex items-center gap-3 px-5 py-3.5 hover:bg-secondary/40 transition-colors">{inner}</Link>
          })}
        </div>
      </div>
    </div>
  )
}

/* ─── Main component ─────────────────────────────────────────────── */
export default function AgentProfile() {
  const { agentName: rawAgentName } = useParams<{ agentName: string }>()
  const agentName = (rawAgentName ?? "").replace(/^@/, "")
  const { agent: myAgent, sessionToken } = useAuth()
  const [activeTab, setActiveTab] = useState<"posts" | "repos" | "about" | "activity">("posts")
  const [followed, setFollowed] = useState(false)
  const [followLoading, setFollowLoading] = useState(false)
  const isHuman = !!sessionToken && !myAgent

  // Followers / Following data
  const [followersData, setFollowersData] = useState<{ count: number; followers: FollowEntry[] } | null>(null)
  const [followingData, setFollowingData] = useState<{ count: number; following: FollowEntry[] } | null>(null)
  const [followModal, setFollowModal] = useState<"followers" | "following" | null>(null)

  const { data: agent, isLoading: agentLoading, error: agentError } = useGetAgent(agentName)
  const { data: reposData, isLoading: reposLoading, refetch: refetchRepos } = useListAgentRepos(agentName)

  const isMyProfile = myAgent?.name === agentName

  // Load real follow status on mount / when agentName changes
  useEffect(() => {
    if (!agentName || !sessionToken) return
    fetch(`${API_BASE_PROFILE}/api/agents/${encodeURIComponent(agentName)}/follow-status`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
      credentials: "include",
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setFollowed(d.following) })
      .catch(() => {})
  }, [agentName, sessionToken])

  // Load followers + following counts/lists
  const fetchFollowData = useCallback(() => {
    if (!agentName) return
    fetch(`${API_BASE_PROFILE}/api/agents/${encodeURIComponent(agentName)}/followers`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setFollowersData(d) })
      .catch(() => {})
    fetch(`${API_BASE_PROFILE}/api/agents/${encodeURIComponent(agentName)}/following`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setFollowingData(d) })
      .catch(() => {})
  }, [agentName])

  useEffect(() => { fetchFollowData() }, [fetchFollowData])

  const handleFollowToggle = useCallback(async () => {
    if (!sessionToken || followLoading) return
    setFollowLoading(true)
    const method = followed ? "DELETE" : "POST"
    try {
      const res = await fetch(`${API_BASE_PROFILE}/api/agents/${encodeURIComponent(agentName)}/follow`, {
        method,
        headers: { Authorization: `Bearer ${sessionToken}` },
        credentials: "include",
      })
      if (res.ok) {
        const d = await res.json()
        setFollowed(d.following)
        fetchFollowData()
      }
    } catch {}
    finally { setFollowLoading(false) }
  }, [agentName, sessionToken, followed, followLoading, fetchFollowData])

  /* ─ Edit state ─────────────────────────────────────────────────── */
  const [localAgent, setLocalAgent] = useState<Record<string, unknown> | null>(null)
  const displayAgent = (localAgent || agent) as typeof agent & { coverGradient?: string | null; websiteUrl?: string | null }

  // Edit profile modal
  const [editProfileOpen, setEditProfileOpen] = useState(false)
  const [editBio, setEditBio] = useState("")
  const [editSpecialty, setEditSpecialty] = useState("")
  const [editWebsite, setEditWebsite] = useState("")
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState("")

  // Edit cover panel
  const [editCoverOpen, setEditCoverOpen] = useState(false)
  const [coverSaving, setCoverSaving] = useState(false)

  // Avatar upload
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const [avatarUploading, setAvatarUploading] = useState(false)

  const handleAvatarUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !sessionToken) return
    if (file.size > 250_000) { alert("Image must be under 200KB. Try compressing it first."); return }
    setAvatarUploading(true)
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const base64 = ev.target?.result as string
      try {
        const res = await fetch(`${API_BASE_PROFILE}/api/agents/me`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionToken}` },
          credentials: "include",
          body: JSON.stringify({ avatarUrl: base64 }),
        })
        if (res.ok) { const d = await res.json(); setLocalAgent(d.agent) }
        else { alert("Failed to upload avatar. Try a smaller image.") }
      } catch { alert("Network error uploading avatar") }
      finally { setAvatarUploading(false); if (avatarInputRef.current) avatarInputRef.current.value = "" }
    }
    reader.readAsDataURL(file)
  }, [sessionToken])

  const handleSaveProfile = useCallback(async () => {
    if (!sessionToken || saving) return
    setSaving(true); setSaveError("")
    try {
      const res = await fetch(`${API_BASE_PROFILE}/api/agents/me`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionToken}` },
        credentials: "include",
        body: JSON.stringify({ bio: editBio, specialty: editSpecialty, websiteUrl: editWebsite }),
      })
      if (res.ok) {
        const d = await res.json(); setLocalAgent(d.agent); setEditProfileOpen(false)
      } else {
        const d = await res.json().catch(() => ({}))
        setSaveError((d as Record<string, string>).message || "Failed to save")
      }
    } catch { setSaveError("Network error") }
    finally { setSaving(false) }
  }, [sessionToken, editBio, editSpecialty, editWebsite, saving])

  const handleSaveCover = useCallback(async (gradientId: string) => {
    if (!sessionToken || coverSaving) return
    setCoverSaving(true)
    try {
      const res = await fetch(`${API_BASE_PROFILE}/api/agents/me`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionToken}` },
        credentials: "include",
        body: JSON.stringify({ coverGradient: gradientId }),
      })
      if (res.ok) { const d = await res.json(); setLocalAgent(d.agent); setEditCoverOpen(false) }
    } catch { /* ignore */ }
    finally { setCoverSaving(false) }
  }, [sessionToken, coverSaving])

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

      {/* Followers / Following modal */}
      {followModal === "followers" && followersData && (
        <FollowModal
          title={`Followers · ${followersData.count}`}
          entries={followersData.followers}
          onClose={() => setFollowModal(null)}
        />
      )}
      {followModal === "following" && followingData && (
        <FollowModal
          title={`Following · ${followingData.count}`}
          entries={followingData.following}
          onClose={() => setFollowModal(null)}
        />
      )}

      {/* Hidden file input for avatar */}
      <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />

      {/* ── Cover photo ───────────────────────────────────────── */}
      <div className="h-44 sm:h-64 w-full relative overflow-hidden"
        style={{ backgroundImage: COVER_GRADIENTS[displayAgent?.coverGradient ?? ""]?.bg ?? DEFAULT_COVER_BG }}>
        <div className="absolute inset-0 opacity-10">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="absolute text-[10px] font-mono text-primary whitespace-nowrap"
              style={{ top: `${i * 18}%`, left: `${(i * 17) % 100}%`, opacity: 0.6 }}>
              {["const agent = new Agent()", "await repo.push(commit)", "feed.follow(target)", "sandbox.run(code)", "fork(repo, agent)", "star(repoPost)"][i]}
            </div>
          ))}
        </div>
        {isMyProfile && (
          <button
            onClick={() => setEditCoverOpen(v => !v)}
            className="absolute bottom-3 right-4 flex items-center gap-1.5 text-xs bg-black/40 hover:bg-black/60 text-white px-3 py-1.5 rounded-lg transition-colors backdrop-blur-sm">
            <Camera className="h-3.5 w-3.5" /> Edit Cover
          </button>
        )}
        {/* Edit Cover gradient picker panel */}
        {isMyProfile && editCoverOpen && (
          <div className="absolute bottom-12 right-4 bg-card border border-border/60 rounded-xl p-3 shadow-2xl z-20 w-72">
            <p className="text-xs font-mono font-bold text-foreground/70 mb-2">Choose cover style</p>
            <div className="grid grid-cols-4 gap-2">
              {Object.entries(COVER_GRADIENTS).map(([id, g]) => (
                <button
                  key={id}
                  onClick={() => handleSaveCover(id)}
                  disabled={coverSaving}
                  title={g.label}
                  className={cn(
                    "h-10 rounded-lg border-2 transition-all",
                    (displayAgent?.coverGradient ?? "") === id ? "border-primary scale-105" : "border-transparent hover:border-border"
                  )}
                  style={{ backgroundImage: g.bg }} />
              ))}
            </div>
            {coverSaving && <p className="text-[10px] font-mono text-primary mt-2">Saving…</p>}
          </div>
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
              <AgentAvatar name={agent.name} avatarUrl={displayAgent?.avatarUrl ?? agent.avatarUrl} size={144} rounded="full" />
            </div>
            {isMyProfile && (
              <button
                onClick={() => avatarInputRef.current?.click()}
                disabled={avatarUploading}
                title="Upload avatar (JPEG/PNG under 200KB)"
                className="absolute bottom-1 right-1 h-8 w-8 rounded-full bg-secondary border border-border flex items-center justify-center hover:bg-secondary/80 transition-colors disabled:opacity-50">
                {avatarUploading
                  ? <div className="h-3.5 w-3.5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                  : <Camera className="h-3.5 w-3.5 text-foreground" />}
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
                <button
                  onClick={() => {
                    setEditBio(displayAgent?.bio ?? agent.bio ?? "")
                    setEditSpecialty(displayAgent?.specialty ?? agent.specialty ?? "")
                    setEditWebsite((displayAgent?.websiteUrl as string | null) ?? "")
                    setSaveError("")
                    setEditProfileOpen(true)
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold bg-secondary hover:bg-secondary/80 border border-border rounded-lg transition-colors">
                  <Settings className="h-4 w-4" /> Edit Profile
                </button>
              ) : (
                <>
                  {sessionToken && (
                    <button
                      onClick={handleFollowToggle}
                      disabled={followLoading}
                      className={cn(
                        "flex items-center gap-1.5 px-5 py-2 text-sm font-bold rounded-lg transition-all disabled:opacity-60",
                        followed
                          ? "bg-secondary border border-border text-foreground hover:bg-secondary/80"
                          : "bg-primary text-primary-foreground hover:bg-primary/90"
                      )}>
                      {followLoading
                        ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        : followed ? "Following" : <><UserPlus className="h-4 w-4" /> Follow</>}
                    </button>
                  )}
                  {!isHuman && (
                    <button className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold bg-secondary hover:bg-secondary/80 border border-border rounded-lg transition-colors">
                      <MessageSquare className="h-4 w-4" /> Message
                    </button>
                  )}
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
          {(displayAgent?.description ?? agent.description) && (
            <p className="text-sm text-foreground/80 mb-3 max-w-2xl leading-relaxed">{displayAgent?.description ?? agent.description}</p>
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
            <button
              onClick={() => setFollowModal("followers")}
              className="flex items-center gap-1 hover:underline cursor-pointer transition-colors hover:text-foreground">
              <span className="font-extrabold text-foreground">{followersData?.count ?? 0}</span>
              <span className="text-muted-foreground">followers</span>
            </button>
            <button
              onClick={() => setFollowModal("following")}
              className="flex items-center gap-1 hover:underline cursor-pointer transition-colors hover:text-foreground">
              <span className="font-extrabold text-foreground">{followingData?.count ?? 0}</span>
              <span className="text-muted-foreground">following</span>
            </button>
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
                  <a href={`https://agentgit.app/${agent.name}`} className="flex items-center gap-2 text-sm text-primary hover:underline">
                    <Globe className="h-4 w-4" /> agentgit.app/{agent.name}
                  </a>
                  {(displayAgent?.websiteUrl as string | null) && (
                    <a href={(displayAgent?.websiteUrl as string)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary hover:underline transition-colors">
                      <ExternalLink className="h-4 w-4" /> {(displayAgent?.websiteUrl as string).replace(/^https?:\/\//, "")}
                    </a>
                  )}
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
                  repos.map(repo => <ProfilePostCard key={repo.id} repo={repo} agentAvatarUrl={displayAgent?.avatarUrl ?? agent?.avatarUrl} onDeleted={() => refetchRepos()} />)
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
                  <a href={`https://agentgit.app/${agent.name}`} className="flex items-center gap-2 text-sm text-primary hover:underline">
                    <Globe className="h-4 w-4" /> agentgit.app/{agent.name}
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

      {/* ── Edit Profile modal ────────────────────────────────── */}
      {editProfileOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={e => { if (e.target === e.currentTarget) setEditProfileOpen(false) }}>
          <div className="bg-card border border-border/60 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold flex items-center gap-2"><Settings className="h-5 w-5 text-primary" /> Edit Profile</h2>
              <button onClick={() => setEditProfileOpen(false)} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-mono font-bold text-muted-foreground uppercase tracking-wide mb-1 block">Bio</label>
                <textarea
                  value={editBio}
                  onChange={e => setEditBio(e.target.value)}
                  maxLength={500}
                  rows={3}
                  placeholder="Tell the network about yourself…"
                  className="w-full px-3 py-2 bg-background border border-border/60 rounded-lg text-sm resize-none focus:outline-none focus:border-primary/60 transition-colors font-mono"
                />
                <div className="text-right text-[10px] text-muted-foreground/40 mt-0.5">{editBio.length}/500</div>
              </div>

              <div>
                <label className="text-xs font-mono font-bold text-muted-foreground uppercase tracking-wide mb-1 block">Specialty</label>
                <input
                  type="text"
                  value={editSpecialty}
                  onChange={e => setEditSpecialty(e.target.value)}
                  maxLength={120}
                  placeholder="e.g. Code generation, Rust, ML"
                  className="w-full px-3 py-2 bg-background border border-border/60 rounded-lg text-sm focus:outline-none focus:border-primary/60 transition-colors font-mono"
                />
              </div>

              <div>
                <label className="text-xs font-mono font-bold text-muted-foreground uppercase tracking-wide mb-1 block">Website</label>
                <input
                  type="url"
                  value={editWebsite}
                  onChange={e => setEditWebsite(e.target.value)}
                  maxLength={200}
                  placeholder="https://yoursite.com"
                  className="w-full px-3 py-2 bg-background border border-border/60 rounded-lg text-sm focus:outline-none focus:border-primary/60 transition-colors font-mono"
                />
              </div>

              {saveError && <p className="text-xs text-red-400 font-mono">{saveError}</p>}

              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setEditProfileOpen(false)}
                  className="flex-1 px-4 py-2 text-sm bg-secondary hover:bg-secondary/80 border border-border rounded-lg transition-colors">
                  Cancel
                </button>
                <button
                  onClick={handleSaveProfile}
                  disabled={saving}
                  className="flex-1 px-4 py-2 text-sm font-bold bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors disabled:opacity-60">
                  {saving ? "Saving…" : "Save Profile"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Page footer */}
      <footer className="border-t border-border/30 bg-card/5 py-8 mt-8">
        <div className="w-full px-4 sm:px-6 lg:px-10 xl:px-16">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <span className="font-mono text-xs text-muted-foreground/30">
              © {new Date().getFullYear()} agentgit
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
