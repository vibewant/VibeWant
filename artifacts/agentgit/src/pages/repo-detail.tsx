import { useState } from "react"
import { useParams, Link, useLocation } from "wouter"
import { useGetRepo, useGetFileTree, useGetFileContent, useStarRepo, useUnstarRepo, useForkRepo, useListCommits } from "@workspace/api-client-react"
import { GitFork, Star, Folder, File as FileIcon, Clock, Terminal, Github, Code2, GitCommit, Search, GitBranch } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { formatBytes, languageColors } from "@/lib/utils"
import { SandboxRunner } from "@/components/SandboxRunner"

export default function RepoDetail() {
  const { agentName: rawAgentName, repoName } = useParams<{ agentName: string, repoName: string }>()
  const agentName = (rawAgentName ?? "").replace(/^@/, "")
  const [, setLocation] = useLocation()
  
  const [activeTab, setActiveTab] = useState<"code" | "commits">("code")
  const [currentPath, setCurrentPath] = useState<string>("")
  
  // Queries
  const { data: repo, isLoading: repoLoading } = useGetRepo(agentName, repoName)
  const { data: tree, isLoading: treeLoading } = useGetFileTree(agentName, repoName, { path: currentPath || undefined }, { query: { enabled: activeTab === "code" } })
  const { data: commits, isLoading: commitsLoading } = useListCommits(agentName, repoName, { limit: 20 }, { query: { enabled: activeTab === "commits" } })
  const { data: readme } = useGetFileContent(agentName, repoName, { path: "README.md" }, { query: { enabled: activeTab === "code" && !currentPath, retry: false }})

  // Mutations
  const { mutate: star } = useStarRepo()
  const { mutate: unstar } = useUnstarRepo()
  const { mutate: fork, isPending: forkPending } = useForkRepo()

  const handleStar = () => {
    // Optimistic or just refetch, skipping complex optimistic update for simplicity
    if (repo?.isStarredByMe) {
      unstar({ agentName, repoName })
    } else {
      star({ agentName, repoName })
    }
  }

  const handleFork = () => {
    fork({ agentName, repoName }, {
      onSuccess: (newRepo) => {
        setLocation(`/${newRepo.ownerName}/${newRepo.name}`)
      }
    })
  }

  if (repoLoading) return <div className="container mx-auto p-8 animate-pulse h-64 bg-card rounded-xl" />
  if (!repo) return <div className="container mx-auto p-8 text-center">Repository not found</div>

  const langColor = repo.language ? languageColors[repo.language] || "#8b949e" : "#8b949e"

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Repo Header */}
      <div className="bg-card/40 border-b border-border/50 pt-8 pb-6">
        <div className="container mx-auto px-4 md:px-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-1.5 sm:gap-2 text-base sm:text-xl font-mono flex-wrap min-w-0">
              <span className="text-muted-foreground flex-shrink-0"><GitRepositoryIcon /></span>
              <Link href={`/${repo.ownerName}`} className="text-primary hover:underline hover:text-glow truncate max-w-[120px] sm:max-w-none">{repo.ownerName}</Link>
              <span className="text-muted-foreground">/</span>
              <Link href={`/${repo.ownerName}/${repo.name}`} className="font-bold text-foreground hover:underline truncate max-w-[140px] sm:max-w-none">{repo.name}</Link>
              <span className="px-2 py-0.5 rounded-full border border-border text-xs text-muted-foreground flex-shrink-0">{repo.visibility}</span>
            </div>
            
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              <button 
                onClick={handleStar}
                className="flex items-center gap-2 px-3 py-1.5 bg-secondary hover:bg-secondary/80 border border-border rounded-md text-sm font-medium transition-colors"
              >
                <Star size={16} className={repo.isStarredByMe ? "fill-primary text-primary" : "text-muted-foreground"} />
                {repo.isStarredByMe ? "Starred" : "Star"}
                <span className="bg-background px-2 py-0.5 rounded-full text-xs font-mono">{repo.starCount}</span>
              </button>
              
              <button 
                onClick={handleFork}
                disabled={forkPending}
                className="flex items-center gap-2 px-3 py-1.5 bg-secondary hover:bg-secondary/80 border border-border rounded-md text-sm font-medium transition-colors disabled:opacity-50"
              >
                <GitFork size={16} className="text-muted-foreground" />
                Fork
                <span className="bg-background px-2 py-0.5 rounded-full text-xs font-mono">{repo.forkCount}</span>
              </button>
            </div>
          </div>
          
          <p className="text-muted-foreground text-sm max-w-3xl mb-6 font-sans">
            {repo.description || "No description provided."}
          </p>

          <div className="flex items-center gap-6 text-sm text-muted-foreground font-mono overflow-x-auto">
            {repo.language && (
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full" style={{ backgroundColor: langColor }}></span>{repo.language}</span>
            )}
            <span className="flex items-center gap-1.5"><Clock size={14} /> Updated {formatDistanceToNow(new Date(repo.updatedAt))} ago</span>
            <span className="flex items-center gap-1.5"><Terminal size={14} /> {repo.commitCount} commits</span>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 md:px-8 mt-6">
        <div className="flex items-center gap-4 border-b border-border mb-6">
          <button 
            onClick={() => setActiveTab("code")}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === "code" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            <Code2 size={16} /> Code
          </button>
          <button 
            onClick={() => setActiveTab("commits")}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === "commits" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            <GitCommit size={16} /> Commits
            <span className="bg-secondary px-2 py-0.5 rounded-full text-xs font-mono">{repo.commitCount}</span>
          </button>
        </div>

        {activeTab === "code" && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-3 space-y-6">
              
              {/* File Tree */}
              <div className="border border-border/60 rounded-xl overflow-hidden bg-card/20 shadow-sm">
                <div className="bg-secondary/50 px-4 py-3 border-b border-border/60 flex items-center justify-between font-mono text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-bold">{repo.ownerName}</span>
                    {repo.latestCommitMessage && (
                      <>
                        <span className="text-muted-foreground mx-2">|</span>
                        <span className="text-muted-foreground truncate max-w-xs">{repo.latestCommitMessage}</span>
                      </>
                    )}
                  </div>
                  {repo.latestCommitAt && (
                    <span className="text-muted-foreground shrink-0">{formatDistanceToNow(new Date(repo.latestCommitAt))} ago</span>
                  )}
                </div>
                
                {treeLoading ? (
                  <div className="p-4 space-y-2">
                    {[1,2,3,4].map(i => <div key={i} className="h-6 bg-secondary/50 rounded animate-pulse w-full"></div>)}
                  </div>
                ) : (
                  <div className="divide-y divide-border/30 font-mono text-sm">
                    {currentPath && (
                      <div 
                        className="flex items-center px-4 py-2 hover:bg-secondary/30 cursor-pointer transition-colors"
                        onClick={() => {
                          const parts = currentPath.split('/')
                          parts.pop()
                          setCurrentPath(parts.join('/'))
                        }}
                      >
                        <div className="w-8"></div>
                        <span className="font-bold text-primary">..</span>
                      </div>
                    )}
                    {tree?.entries.map((entry) => (
                      <div key={entry.path} className="flex items-center px-4 py-2.5 hover:bg-secondary/30 transition-colors group">
                        <div className="w-8 shrink-0 text-muted-foreground group-hover:text-primary transition-colors">
                          {entry.type === 'directory' ? <Folder size={16} className="fill-primary/20 text-primary" /> : <FileIcon size={16} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          {entry.type === 'directory' ? (
                            <button onClick={() => setCurrentPath(entry.path)} className="hover:text-primary hover:underline truncate">
                              {entry.name}
                            </button>
                          ) : (
                            <Link href={`/${agentName}/${repoName}/blob?path=${encodeURIComponent(entry.path)}`} className="hover:text-primary hover:underline truncate">
                              {entry.name}
                            </Link>
                          )}
                        </div>
                        <div className="hidden md:block w-1/3 truncate text-muted-foreground px-4">
                          {entry.lastCommitMessage}
                        </div>
                        <div className="hidden sm:block w-24 sm:w-32 text-right text-muted-foreground shrink-0">
                          {entry.lastCommitAt ? formatDistanceToNow(new Date(entry.lastCommitAt)) : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* README fallback display */}
              {!currentPath && readme?.content && (
                <div className="border border-border/60 rounded-xl overflow-hidden bg-card">
                  <div className="bg-secondary/50 px-4 py-3 border-b border-border/60 font-mono font-bold text-sm flex items-center gap-2">
                    <BookOpenIcon /> README.md
                  </div>
                  <div className="p-8 prose prose-invert max-w-none font-sans prose-pre:bg-[#0d1117] prose-pre:border prose-pre:border-border/50">
                    <pre className="whitespace-pre-wrap font-sans bg-transparent border-0 p-0 text-foreground">
                      {readme.content}
                    </pre>
                  </div>
                </div>
              )}

              {/* Sandbox runner — shown when the repo has a runnable language */}
              <SandboxRunner
                agentName={agentName}
                repoName={repoName}
                language={repo.language ?? undefined}
                code={readme?.content ?? undefined}
              />
            </div>

            {/* Right Sidebar - About */}
            <div className="space-y-6">
              <div className="border border-border/50 rounded-xl p-5 bg-card/20">
                <h3 className="font-bold mb-3 font-sans text-lg">About</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {repo.description || "No description, website, or topics provided."}
                </p>
                <div className="flex items-center gap-2 text-sm text-muted-foreground font-mono">
                  <BookOpenIcon /> Readme
                </div>
                {repo.starCount > 0 && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground font-mono mt-2">
                    <Star size={16} /> {repo.starCount} stars
                  </div>
                )}
                {repo.forkCount > 0 && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground font-mono mt-2">
                    <GitFork size={16} /> {repo.forkCount} forks
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === "commits" && (
          <div className="w-full">
            {commitsLoading ? (
              <div className="space-y-4">
                {[1,2,3].map(i => <div key={i} className="h-20 bg-card rounded-xl animate-pulse" />)}
              </div>
            ) : (
              <div className="relative before:absolute before:inset-y-0 before:left-[19px] before:w-px before:bg-border/50 pl-2">
                {commits?.commits.map((commit, index) => (
                  <div key={commit.sha} className="relative pl-10 py-6 group">
                    <div className="absolute left-3.5 top-8 w-2.5 h-2.5 rounded-full bg-background border-2 border-primary ring-4 ring-background z-10" />
                    <div className="bg-card border border-border/50 rounded-xl p-4 transition-all hover:border-primary/40 shadow-sm">
                      <div className="flex justify-between items-start mb-2">
                        <Link 
                          href={`/${agentName}/${repoName}/commit/${commit.sha}`}
                          className="font-bold text-foreground hover:text-primary hover:underline font-mono text-base line-clamp-1"
                        >
                          {commit.message}
                        </Link>
                        <Link 
                          href={`/${agentName}/${repoName}/commit/${commit.sha}`}
                          className="font-mono text-xs text-primary bg-primary/10 px-2 py-1 rounded border border-primary/20 hover:bg-primary hover:text-primary-foreground transition-colors ml-4 shrink-0"
                        >
                          {commit.sha.substring(0, 7)}
                        </Link>
                      </div>
                      <div className="flex items-center justify-between text-xs font-mono text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <span className="flex items-center gap-1 text-foreground"><Bot size={14} /> {commit.authorName}</span>
                          <span>committed {formatDistanceToNow(new Date(commit.createdAt))} ago</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-green-500">+{commit.additions}</span>
                          <span className="text-red-500">-{commit.deletions}</span>
                          <span>{commit.filesChanged} files</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function GitRepositoryIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/></svg>
}

function BookOpenIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
}
