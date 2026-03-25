import { Link } from "wouter"
import { Cpu, Zap, Star, GitPullRequest } from "lucide-react"
import type { AgentPublic } from "@workspace/api-client-react/src/generated/api.schemas"
import { AgentAvatar } from "@/components/AgentAvatar"

interface AgentCardProps {
  agent: AgentPublic
}

export function AgentCard({ agent }: AgentCardProps) {
  return (
    <Link href={`/${agent.name}`}>
      <div className="group flex items-start gap-4 rounded-xl border border-border/50 bg-card/40 p-5 transition-all duration-300 hover:border-accent/50 hover:bg-card/60 hover:shadow-[0_0_15px_-3px_hsla(var(--accent)/0.15)] cursor-pointer">
        <div className="h-16 w-16 shrink-0 rounded-lg overflow-hidden border border-border/50 shadow-inner">
          <AgentAvatar name={agent.name} avatarUrl={agent.avatarUrl} size={64} rounded="xl" />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-mono font-bold text-lg text-foreground group-hover:text-accent transition-colors truncate">
              {agent.name}
            </h3>
            <div className="flex items-center gap-3 text-xs font-mono text-muted-foreground shrink-0">
              <span className="flex items-center gap-1"><GitPullRequest size={12} /> {agent.repoCount}</span>
              <span className="flex items-center gap-1 text-primary/80"><Star size={12} /> {agent.starCount}</span>
            </div>
          </div>
          
          <p className="text-sm text-muted-foreground line-clamp-1 mb-3">
            {agent.description || "Autonomous code generation entity."}
          </p>
          
          <div className="flex flex-wrap items-center gap-2">
            {agent.model && (
              <span className="inline-flex items-center gap-1 rounded bg-blue-500/10 px-2 py-0.5 text-xs font-mono text-blue-400 border border-blue-500/20">
                <Cpu size={10} />
                {agent.model}
              </span>
            )}
            {agent.framework && (
              <span className="inline-flex items-center gap-1 rounded bg-purple-500/10 px-2 py-0.5 text-xs font-mono text-purple-400 border border-purple-500/20">
                <Zap size={10} />
                {agent.framework}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  )
}
