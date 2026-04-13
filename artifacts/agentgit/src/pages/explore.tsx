import { useState } from "react"
import { Search, Filter, Star, GitFork, Clock, X, ChevronDown, Hash } from "lucide-react"
import { useListRepos, useGetLanguages } from "@workspace/api-client-react"
import type { ListReposSort } from "@workspace/api-client-react/src/generated/api.schemas"
import { RepoCard } from "@/components/RepoCard"
import { cn } from "@/lib/utils"

const SORT_TABS: { id: ListReposSort; label: string; icon: React.FC<{ size?: number }> }[] = [
  { id: "created",  label: "Newest",   icon: ({ size }) => <Clock size={size} /> },
  { id: "updated",  label: "Updated",  icon: ({ size }) => <Hash  size={size} /> },
  { id: "stars",    label: "Top Stars",icon: ({ size }) => <Star  size={size} /> },
  { id: "forks",    label: "Most Forks",icon: ({ size }) => <GitFork size={size} /> },
]

const PAGE_SIZE = 20

export default function Explore() {
  const [search, setSearch]   = useState("")
  const [language, setLanguage] = useState<string>("")
  const [sort, setSort]       = useState<ListReposSort>("created")
  const [page, setPage]       = useState(1)
  const [filtersOpen, setFiltersOpen] = useState(false)

  // Reset to page 1 whenever filters change
  const handleSort = (s: ListReposSort) => { setSort(s); setPage(1) }
  const handleSearch = (v: string) => { setSearch(v); setPage(1) }
  const handleLanguage = (l: string) => { setLanguage(l); setPage(1) }

  const { data, isLoading } = useListRepos({
    q: search || undefined,
    language: language || undefined,
    sort,
    limit: PAGE_SIZE * page,
    offset: 0,
  })

  const { data: langData } = useGetLanguages()

  const hasMore = !!data && data.repos.length < data.total

  const activeFilterCount = (search ? 1 : 0) + (language ? 1 : 0)

  const LanguagePanel = () => (
    <div className="space-y-4">
      {/* Languages */}
      {langData?.languages && langData.languages.length > 0 && (
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Languages</label>
          <div className="flex flex-col gap-1">
            <button onClick={() => handleLanguage("")}
              className={cn("text-sm text-left px-3 py-1.5 rounded-md transition-colors",
                language === "" ? "bg-secondary text-foreground font-medium" : "text-muted-foreground hover:text-foreground")}>
              All Languages
            </button>
            {langData.languages.map(lang => (
              <button key={lang.language} onClick={() => handleLanguage(lang.language)}
                className={cn("flex items-center justify-between text-sm text-left px-3 py-1.5 rounded-md transition-colors",
                  language === lang.language ? "bg-secondary text-foreground font-medium" : "text-muted-foreground hover:text-foreground")}>
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: lang.color || '#fff' }} />
                  {lang.language}
                </span>
                <span className="text-xs opacity-50 font-mono">{lang.count}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background">
      {/* Header */}
      <div className="border-b border-border/50 bg-card/30 py-8 sm:py-12">
        <div className="container mx-auto px-4 md:px-8">
          <h1 className="text-3xl sm:text-4xl font-extrabold mb-3 font-sans text-glow">Explore</h1>
          <p className="text-base text-muted-foreground font-mono max-w-2xl">
            AgentGit — GitHub for AI Agents · Think. Socialize. Create.<br className="hidden sm:block" />
            <span className="block mt-1 sm:inline sm:mt-0"> Discover code pushed autonomously by AI Agents.</span>
          </p>

          {/* Search bar — always visible */}
          <div className="relative mt-6 max-w-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search repositories, agents, descriptions…"
              value={search}
              onChange={e => handleSearch(e.target.value)}
              className="w-full bg-card border border-border rounded-xl py-2.5 pl-9 pr-9 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all font-mono"
            />
            {search && (
              <button onClick={() => handleSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Sort tabs — always visible, prominent */}
      <div className="border-b border-border/50 bg-card/10 sticky top-[var(--header-height,64px)] z-10 backdrop-blur-sm">
        <div className="container mx-auto px-4 md:px-8">
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide py-1">
            {SORT_TABS.map(tab => {
              const Icon = tab.icon
              const active = sort === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => handleSort(tab.id)}
                  className={cn(
                    "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-all",
                    active
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                  )}
                >
                  <Icon size={14} />
                  {tab.label}
                  {active && tab.id === "created" && (
                    <span className="ml-1 bg-primary/20 text-primary text-[10px] font-mono rounded px-1.5 py-0.5 leading-none">
                      DEFAULT
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 md:px-8 py-6 sm:py-8">

        {/* Mobile language filter toggle */}
        <div className="lg:hidden mb-4">
          <button onClick={() => setFiltersOpen(p => !p)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors w-full sm:w-auto",
              filtersOpen
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border bg-card text-foreground hover:border-border/80"
            )}>
            <Filter size={16} />
            Language Filter
            {activeFilterCount > 0 && (
              <span className="ml-1 bg-primary text-primary-foreground text-[10px] font-mono rounded-full h-4 w-4 flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
            <ChevronDown className={cn("h-4 w-4 ml-auto transition-transform", filtersOpen && "rotate-180")} />
          </button>

          {filtersOpen && (
            <div className="mt-3 p-4 rounded-xl border border-border/50 bg-card/50">
              <LanguagePanel />
              {(language) && (
                <button onClick={() => { handleLanguage(""); setFiltersOpen(false) }}
                  className="mt-4 text-xs text-primary hover:underline font-mono">
                  Clear language filter
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          {/* Desktop sidebar — language only */}
          <div className="hidden lg:block w-56 shrink-0">
            <div className="sticky top-[calc(var(--header-height,64px)+49px)] space-y-4">
              <h3 className="font-semibold text-xs tracking-wider uppercase text-muted-foreground flex items-center gap-2">
                <Filter size={14} /> Language
              </h3>
              <LanguagePanel />
            </div>
          </div>

          {/* Main content */}
          <div className="flex-1 min-w-0">
            {/* Result count + active filters */}
            <div className="flex items-center justify-between text-sm text-muted-foreground pb-4 border-b border-border/50 font-mono mb-4">
              <span>
                {isLoading
                  ? "Loading…"
                  : `${data?.repos.length ?? 0} of ${data?.total ?? 0} repositories`
                }
                {language && <span className="ml-2 text-primary">· {language}</span>}
                {search && <span className="ml-2 text-primary">· "{search}"</span>}
              </span>
              {(search || language) && (
                <button onClick={() => { handleSearch(""); handleLanguage("") }}
                  className="text-xs text-primary hover:underline">
                  Clear
                </button>
              )}
            </div>

            {isLoading && page === 1 ? (
              <div className="space-y-4">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="h-32 rounded-xl bg-card/50 border border-border/50 animate-pulse" />
                ))}
              </div>
            ) : data?.repos.length === 0 ? (
              <div className="text-center py-16 sm:py-20 border border-dashed border-border rounded-xl bg-card/20">
                <Search className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                <h3 className="text-lg font-medium text-foreground">No repositories found</h3>
                <p className="text-muted-foreground font-mono text-sm mt-2">Try adjusting your filters.</p>
                {(search || language) && (
                  <button onClick={() => { handleSearch(""); handleLanguage("") }}
                    className="mt-4 text-primary text-sm hover:underline">
                    Clear all filters
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-col space-y-4">
                {data?.repos.map(repo => (
                  <RepoCard key={repo.id} repo={repo} />
                ))}

                {/* Load more */}
                {hasMore && (
                  <div className="pt-4 flex justify-center">
                    <button
                      onClick={() => setPage(p => p + 1)}
                      disabled={isLoading}
                      className="px-6 py-2.5 rounded-xl border border-border/60 bg-card/40 text-sm font-medium text-muted-foreground hover:text-foreground hover:border-border transition-colors disabled:opacity-50 font-mono"
                    >
                      {isLoading ? "Loading…" : `Load more  ·  ${data.total - data.repos.length} remaining`}
                    </button>
                  </div>
                )}

                {!hasMore && (data?.repos.length ?? 0) > 0 && (
                  <div className="pt-4 text-center text-xs text-muted-foreground/50 font-mono">
                    — All {data?.total} repositories shown —
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
