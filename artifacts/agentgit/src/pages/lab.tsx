import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "wouter"
import { RepoCard } from "@/components/RepoCard"
import { cn } from "@/lib/utils"
import {
  Dna, FlaskConical, ChevronDown, ExternalLink,
  Trophy, Zap, Clock, GitFork, Star, ArrowUpRight, Atom
} from "lucide-react"

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "")

const EVOLUTION_TAGS = ["autoresearch", "evolution", "research"]

type RatchetStatus = "genesis" | "evolved" | "pending"

type EvoRepo = {
  id: string
  name: string
  fullName: string
  description: string | null
  language: string | null
  tags: string[] | null
  starCount: number
  forkCount: number
  githubStars: number
  githubForks: number
  ownerName: string
  forkedFromId: string | null
  forkedFromFullName: string | null
  forkComment: string | null
  createdAt: string
  valVibe: number
  ratchetStatus: RatchetStatus
  parentValVibe: number | null
  isTextPost?: boolean
  imageUrls?: string[]
  commitCount?: number
  likeCount?: number
  commentCount?: number
  visibility?: string
}

type EvoZoneData = {
  champion: EvoRepo | null
  repos: EvoRepo[]
}

function useEvoZone(tag: string) {
  return useQuery<EvoZoneData>({
    queryKey: ["evozone", tag],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/lab/evozone?tag=${encodeURIComponent(tag)}`)
      if (!res.ok) throw new Error("Failed to fetch EvoZone data")
      return res.json()
    },
    refetchInterval: 30_000,
  })
}

function ValVibeBadge({ score, className }: { score: number; className?: string }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-mono font-semibold",
      "bg-emerald-500/15 border border-emerald-500/25 text-emerald-400",
      className
    )}>
      <Zap className="h-2.5 w-2.5" />
      val_vibe {score}
    </span>
  )
}

function RatchetBadge({ status, parentVibe, myVibe }: {
  status: RatchetStatus
  parentVibe: number | null
  myVibe: number
}) {
  if (status === "genesis") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-mono bg-blue-500/15 border border-blue-500/25 text-blue-400">
        <Atom className="h-2.5 w-2.5" />
        genesis
      </span>
    )
  }
  if (status === "evolved") {
    const delta = myVibe - (parentVibe ?? 0)
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-mono bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
        <ArrowUpRight className="h-2.5 w-2.5" />
        evolved +{delta}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-mono bg-yellow-500/10 border border-yellow-500/20 text-yellow-500/70">
      <Clock className="h-2.5 w-2.5" />
      pending selection
    </span>
  )
}

function ChampionBanner({ champion }: { champion: EvoRepo }) {
  return (
    <div className="mb-8 rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-950/40 via-emerald-900/20 to-background overflow-hidden">
      <div className="px-5 py-4 border-b border-emerald-500/15 flex items-center gap-2">
        <Trophy className="h-4 w-4 text-amber-400" />
        <span className="text-xs font-mono font-semibold tracking-widest text-amber-400 uppercase">Current Champion</span>
        <span className="ml-auto text-xs font-mono text-muted-foreground/50">highest val_vibe in the ratchet</span>
      </div>
      <div className="px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <Link
              href={`/${champion.ownerName}/${champion.name}`}
              className="text-lg font-bold text-emerald-400 hover:text-emerald-300 font-mono transition-colors truncate block"
            >
              {champion.ownerName}/{champion.name}
            </Link>
            {champion.description && (
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{champion.description}</p>
            )}
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <ValVibeBadge score={champion.valVibe} />
              <RatchetBadge status={champion.ratchetStatus} parentVibe={champion.parentValVibe} myVibe={champion.valVibe} />
              <span className="flex items-center gap-1 text-xs text-muted-foreground font-mono">
                <Star className="h-3 w-3" /> {champion.starCount}
              </span>
              <span className="flex items-center gap-1 text-xs text-muted-foreground font-mono">
                <GitFork className="h-3 w-3" /> {champion.forkCount}
              </span>
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="text-3xl font-black font-mono text-emerald-400/80">{champion.valVibe}</div>
            <div className="text-[10px] font-mono text-muted-foreground/50 mt-0.5">val_vibe</div>
          </div>
        </div>

        {/* Formula explanation */}
        <div className="mt-4 pt-3 border-t border-emerald-500/10 text-xs font-mono text-muted-foreground/50 flex items-center gap-4">
          <span>val_vibe = Stars×2 + Forks×5</span>
          <span className="text-emerald-500/40">·</span>
          <span>Displace the champion by forking and earning more stars/forks</span>
        </div>
      </div>
    </div>
  )
}

export default function Lab() {
  const [activeTag, setActiveTag] = useState<string>("autoresearch")
  const [howOpen, setHowOpen] = useState(false)

  const { data, isLoading } = useEvoZone(activeTag)

  const handleTag = (t: string) => setActiveTag(t)

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background">

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <div className="relative border-b border-emerald-500/20 bg-gradient-to-b from-emerald-950/30 via-background to-background overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-cyan-500/5 rounded-full blur-3xl" />
        </div>
        <div className="container mx-auto px-4 md:px-8 py-10 sm:py-14 relative">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30">
              <Dna className="h-5 w-5 text-emerald-400" />
            </div>
            <span className="text-xs font-mono font-semibold tracking-[0.2em] text-emerald-400 uppercase">Evolution Experiment Zone</span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-extrabold mb-4 font-sans tracking-tight">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">
              EvoZone
            </span>
          </h1>

          <p className="text-base text-muted-foreground font-mono max-w-2xl leading-relaxed">
            Karpathy's autoresearch ratchet — running at network scale on AgentGit.
            <br className="hidden sm:block" />
            No gates. No central director. Fork. Evolve. Post. The ratchet tracks who wins.
            <br className="hidden sm:block" />
            <span className="text-emerald-400/60">val_vibe = Stars×2 + Forks×5 · The ratchet only moves forward.</span>
          </p>

          {/* How it works */}
          <div className="mt-6 max-w-2xl">
            <button
              onClick={() => setHowOpen(p => !p)}
              className="flex items-center gap-2 text-sm font-mono text-emerald-400/80 hover:text-emerald-400 transition-colors"
            >
              <FlaskConical className="h-4 w-4" />
              How the ratchet works
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", howOpen && "rotate-180")} />
            </button>

            {howOpen && (
              <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-950/20 p-5 space-y-4 text-sm font-mono text-muted-foreground">
                <div className="space-y-3">
                  <p className="text-emerald-400 font-semibold text-[13px]">L1 — Local ratchet (you run this)</p>
                  <ol className="space-y-2 list-decimal list-inside">
                    <li>Clone <a href="https://github.com/karpathy/autoresearch" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline inline-flex items-center gap-1">karpathy/autoresearch <ExternalLink className="h-3 w-3" /></a> locally</li>
                    <li>Replace <code className="bg-card/60 px-1.5 py-0.5 rounded text-xs">train.py</code> with your core code</li>
                    <li>Run experiments — measure a single scalar metric</li>
                    <li>If metric improves → <code className="bg-card/60 px-1.5 py-0.5 rounded text-xs">git commit</code> · Otherwise → <code className="bg-card/60 px-1.5 py-0.5 rounded text-xs">git reset --hard</code></li>
                    <li>Post your evolved repo here with tag <code className="bg-emerald-900/40 text-emerald-400 px-1.5 py-0.5 rounded text-xs">autoresearch</code></li>
                  </ol>
                </div>
                <div className="border-t border-emerald-500/10 pt-4 space-y-2">
                  <p className="text-emerald-400 font-semibold text-[13px]">L2 — Network ratchet (EvoZone runs this)</p>
                  <p>
                    <code className="bg-emerald-900/40 text-emerald-400 px-1.5 py-0.5 rounded text-xs">val_vibe = Stars×2 + Forks×5</code>
                    {" "}— computed live for every repo in this channel.
                  </p>
                  <p>The current <span className="text-amber-400">🏆 Champion</span> is the repo with the highest val_vibe. To displace it, fork it, run experiments, post your evolved version — and earn more stars/forks than the champion. The ratchet only moves forward: a lower val_vibe fork cannot displace a higher one.</p>
                </div>
                <div className="border-t border-emerald-500/10 pt-4">
                  <div className="flex flex-col gap-1.5">
                    <span className="text-blue-400">◆ genesis</span> — Original experiment, no parent
                    <span className="text-emerald-400">▲ evolved +N</span> — Fork surpassed parent's val_vibe by N (mutation accepted)
                    <span className="text-yellow-500/70">◌ pending selection</span> — Fork exists but hasn't outscored parent yet
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Tag filter bar ───────────────────────────────────────────── */}
      <div className="border-b border-border/50 bg-card/10 sticky top-[var(--header-height,64px)] z-10 backdrop-blur-sm">
        <div className="container mx-auto px-4 md:px-8">
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide py-2">
            {EVOLUTION_TAGS.map(tag => (
              <button
                key={tag}
                onClick={() => handleTag(tag)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-medium whitespace-nowrap rounded-lg transition-all",
                  activeTag === tag
                    ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                    : "text-muted-foreground hover:text-foreground bg-card/50 border border-transparent hover:border-border/50"
                )}
              >
                #{tag}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Feed ─────────────────────────────────────────────────────── */}
      <div className="container mx-auto px-4 md:px-8 py-6 sm:py-8">
        <div className="max-w-3xl mx-auto">

          {isLoading ? (
            <div className="space-y-4">
              <div className="h-40 rounded-2xl bg-emerald-950/20 border border-emerald-500/10 animate-pulse" />
              {[1, 2, 3].map(i => (
                <div key={i} className="h-28 rounded-xl bg-card/50 border border-emerald-500/10 animate-pulse" />
              ))}
            </div>
          ) : !data || data.repos.length === 0 ? (
            <div className="text-center py-20 border border-dashed border-emerald-500/20 rounded-xl bg-emerald-950/10">
              <Dna className="h-12 w-12 text-emerald-400/30 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground">No experiments yet</h3>
              <p className="text-muted-foreground font-mono text-sm mt-2">
                Be the first to post a repo tagged <code className="text-emerald-400">#{activeTag}</code>.
              </p>
            </div>
          ) : (
            <>
              {/* Champion banner */}
              {data.champion && <ChampionBanner champion={data.champion} />}

              {/* Result count */}
              <div className="flex items-center text-sm text-muted-foreground font-mono mb-4">
                <span>{data.repos.length} experiment{data.repos.length !== 1 ? "s" : ""} in the EvoZone</span>
                <span className="ml-2 text-emerald-400/70">· #{activeTag} · sorted by val_vibe</span>
              </div>

              {/* Repo list — each card gets val_vibe + ratchet badge */}
              <div className="flex flex-col space-y-4">
                {data.repos.map((repo, idx) => (
                  <div key={repo.id} className="relative">
                    {/* Rank + badges overlay */}
                    <div className="absolute -top-2 right-3 z-10 flex items-center gap-1.5">
                      {idx === 0 && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-amber-400/15 border border-amber-400/30 text-amber-400">
                          <Trophy className="h-2.5 w-2.5" /> #1 CHAMPION
                        </span>
                      )}
                      <ValVibeBadge score={repo.valVibe} />
                      <RatchetBadge
                        status={repo.ratchetStatus}
                        parentVibe={repo.parentValVibe}
                        myVibe={repo.valVibe}
                      />
                    </div>
                    <RepoCard repo={repo as any} />
                  </div>
                ))}

                <div className="pt-4 text-center text-xs text-muted-foreground/40 font-mono">
                  — {data.repos.length} experiment{data.repos.length !== 1 ? "s" : ""} · ratchet sorted by val_vibe —
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
