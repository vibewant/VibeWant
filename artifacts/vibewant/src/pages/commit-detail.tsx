import { useParams, Link } from "wouter"
import { useGetCommit } from "@workspace/api-client-react"
import { ArrowLeft, Bot, GitCommit, FileText, Plus, Minus } from "lucide-react"
import { formatDistanceToNow } from "date-fns"

export default function CommitDetail() {
  const { agentName: rawAgentName, repoName, sha } = useParams<{ agentName: string, repoName: string, sha: string }>()
  const agentName = (rawAgentName ?? "").replace(/^@/, "")
  
  const { data: commit, isLoading } = useGetCommit(agentName, repoName, sha)

  if (isLoading) {
    return <div className="container mx-auto p-8 animate-pulse"><div className="h-40 bg-card rounded-xl mb-8" /><div className="h-64 bg-card rounded-xl" /></div>
  }

  if (!commit) return <div className="container mx-auto p-8 text-center">Commit not found</div>

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background pb-20">
      <div className="bg-card/40 border-b border-border/50 py-6">
        <div className="container mx-auto px-4 md:px-8">
          <Link 
            href={`/${agentName}/${repoName}`}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground font-mono mb-4 transition-colors"
          >
            <ArrowLeft size={16} /> Back to repository
          </Link>
          
          <h1 className="text-2xl font-bold font-mono mb-4 text-foreground leading-tight">
            {commit.message}
          </h1>
          
          <div className="flex flex-wrap items-center gap-4 text-sm border border-border/50 rounded-lg p-3 bg-background font-mono">
            <div className="flex items-center gap-2">
              <div className="bg-secondary p-1 rounded"><Bot size={16} /></div>
              <span className="font-bold text-primary">{commit.authorName}</span>
            </div>
            <span className="text-muted-foreground">committed {formatDistanceToNow(new Date(commit.createdAt))} ago</span>
            
            <div className="w-px h-4 bg-border hidden sm:block"></div>
            
            <div className="flex items-center gap-2 text-muted-foreground">
              <span>commit</span>
              <span className="text-foreground">{commit.sha}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 md:px-8 mt-8">
        <div className="flex items-center gap-6 mb-6 font-mono text-sm border-b border-border pb-4">
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-muted-foreground" />
            <span className="font-bold">{commit.filesChanged}</span> changed files
          </div>
          <div className="flex items-center gap-1.5 text-green-500">
            <Plus size={14} /> {commit.additions} additions
          </div>
          <div className="flex items-center gap-1.5 text-red-500">
            <Minus size={14} /> {commit.deletions} deletions
          </div>
        </div>

        <div className="space-y-6">
          {commit.files.map((file, i) => (
            <div key={i} className="border border-border/60 rounded-xl overflow-hidden bg-card/30">
              <div className="bg-secondary/40 px-4 py-2 border-b border-border/60 flex items-center justify-between font-mono text-sm">
                <div className="flex items-center gap-2">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${
                    file.action === 'add' ? 'bg-green-500/20 text-green-500' :
                    file.action === 'delete' ? 'bg-red-500/20 text-red-500' :
                    'bg-blue-500/20 text-blue-500'
                  }`}>
                    {file.action}
                  </span>
                  <span className="font-bold text-foreground">{file.path}</span>
                </div>
                <div className="flex items-center gap-3 opacity-80">
                  {file.additions !== undefined && <span className="text-green-500">+{file.additions}</span>}
                  {file.deletions !== undefined && <span className="text-red-500">-{file.deletions}</span>}
                </div>
              </div>
              
              {file.content && (
                <div className="overflow-x-auto">
                  <pre className="p-4 text-[13px] leading-relaxed font-mono text-muted-foreground m-0 bg-transparent border-none rounded-none">
                    {file.content.split('\n').map((line, idx) => {
                      const isAdded = line.startsWith('+');
                      const isRemoved = line.startsWith('-');
                      return (
                        <div key={idx} className={`px-4 -mx-4 ${
                          isAdded ? 'bg-green-500/10 text-green-400' : 
                          isRemoved ? 'bg-red-500/10 text-red-400' : ''
                        }`}>
                          <span className="inline-block w-8 text-right mr-4 opacity-30 select-none">{idx + 1}</span>
                          <span>{line}</span>
                        </div>
                      )
                    })}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
