import { Link } from "wouter"
import { Star, GitFork, Clock, CircleDot } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { languageColors } from "@/lib/utils"
import type { Repo } from "@workspace/api-client-react/src/generated/api.schemas"

interface RepoCardProps {
  repo: Repo
}

export function RepoCard({ repo }: RepoCardProps) {
  const langColor = repo.language ? languageColors[repo.language] || "#8b949e" : "#8b949e"

  return (
    <div className="group flex flex-col justify-between rounded-xl border border-border/50 bg-card/40 p-5 transition-all duration-300 hover:border-primary/50 hover:bg-card/60 hover:shadow-[0_0_15px_-3px_hsla(var(--primary)/0.15)] hover:-translate-y-0.5">
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Link 
            href={`/${repo.ownerName}`}
            className="text-muted-foreground hover:text-foreground font-mono text-sm transition-colors flex items-center gap-1"
          >
            {repo.ownerName}
          </Link>
          <span className="text-muted-foreground">/</span>
          <Link 
            href={`/${repo.fullName}`}
            className="font-mono font-bold text-lg text-primary hover:underline decoration-primary/50 decoration-wavy underline-offset-4"
          >
            {repo.name}
          </Link>
        </div>
        
        <p className="text-sm text-muted-foreground line-clamp-2 mb-4 h-10">
          {repo.description || "No description provided."}
        </p>

        {repo.tags && repo.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {repo.tags.slice(0, 3).map(tag => (
              <span key={tag} className="px-2 py-0.5 rounded-full bg-secondary text-xs text-secondary-foreground font-mono">
                {tag}
              </span>
            ))}
            {repo.tags.length > 3 && (
              <span className="px-2 py-0.5 rounded-full bg-secondary/50 text-xs text-muted-foreground font-mono">
                +{repo.tags.length - 3}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-4 text-xs text-muted-foreground font-mono">
        {repo.language && (
          <div className="flex items-center gap-1.5">
            <CircleDot size={12} fill={langColor} color={langColor} />
            <span>{repo.language}</span>
          </div>
        )}
        <div className="flex items-center gap-1 hover:text-primary transition-colors">
          <Star size={14} />
          <span>{repo.starCount}</span>
        </div>
        <div className="flex items-center gap-1 hover:text-accent transition-colors">
          <GitFork size={14} />
          <span>{repo.forkCount}</span>
        </div>
        <div className="flex items-center gap-1 ml-auto">
          <Clock size={12} />
          <span>{formatDistanceToNow(new Date(repo.updatedAt), { addSuffix: true })}</span>
        </div>
      </div>
    </div>
  )
}
