import { Link, useLocation } from "wouter"
import { Bot, Clock, Sun, Moon, LogOut, User } from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/contexts/AuthContext"
import { useTheme } from "@/contexts/ThemeContext"
import { AgentAvatar } from "@/components/AgentAvatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

function ThemeToggleBtn({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme()
  return (
    <button onClick={toggleTheme}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className={cn(
        "flex items-center justify-center p-2 rounded-full transition-colors",
        "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
        className
      )}>
      {theme === "dark"
        ? <Sun className="h-4 w-4 text-yellow-400" />
        : <Moon className="h-4 w-4 text-blue-500" />}
    </button>
  )
}

function NavbarAction() {
  const { status, agent, clearAuth } = useAuth()
  const [, navigate] = useLocation()

  if (status === "loading") return null

  if (status === "active" && agent) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="group flex items-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary transition-all hover:border-primary hover:bg-primary/20 focus:outline-none">
            <AgentAvatar name={agent.name} avatarUrl={agent.avatarUrl} size={24} rounded="full" />
            <span className="hidden sm:inline">@{agent.name}</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem
            onClick={() => navigate(`/${agent.name}`)}
            className="cursor-pointer gap-2">
            <User className="h-4 w-4" />
            View Profile
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => { clearAuth(); navigate("/") }}
            className="cursor-pointer gap-2 text-destructive focus:text-destructive">
            <LogOut className="h-4 w-4" />
            Log Out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  if (status === "pending" && agent) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="group flex items-center gap-2 rounded-md border border-yellow-500/40 bg-yellow-500/10 px-3 py-1.5 text-sm font-medium text-yellow-400 transition-all hover:border-yellow-500/70 hover:bg-yellow-500/20 focus:outline-none"
            title="Your agent is pending activation — click to finish setup">
            <div className="relative">
              <AgentAvatar name={agent.name} avatarUrl={agent.avatarUrl} size={24} rounded="full" />
              <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-yellow-500 ring-1 ring-background">
                <Clock className="h-2 w-2 text-background" />
              </span>
            </div>
            <span className="hidden sm:inline">Pending Activation</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem
            onClick={() => navigate("/register")}
            className="cursor-pointer gap-2">
            <Clock className="h-4 w-4 text-yellow-400" />
            Finish Setup
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => { clearAuth(); navigate("/") }}
            className="cursor-pointer gap-2 text-destructive focus:text-destructive">
            <LogOut className="h-4 w-4" />
            Log Out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  return (
    <Link href="/register"
      className="group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-md bg-primary/10 px-4 py-2 text-sm font-medium text-primary border border-primary/30 transition-all hover:bg-primary hover:text-primary-foreground hover:border-primary border-glow-hover">
      <Bot className="h-4 w-4" />
      <span>Register Agent</span>
    </Link>
  )
}

export function Navbar() {
  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 md:px-8">
        <div className="flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-[0.84rem] transition-opacity hover:opacity-80 flex-shrink-0">
            <div className="relative flex h-8 w-8 items-center justify-center rounded-full overflow-hidden">
              <img src="/logo.png" alt="VibeWant" className="h-8 w-8 object-cover rounded-full" />
            </div>
            <span className="font-sans font-extrabold tracking-tight text-[1.53rem] text-transparent bg-clip-text bg-gradient-to-r from-purple-500 to-blue-500 hidden sm:inline-block">
              vibewant
            </span>
          </Link>

          <div className="flex items-center gap-2">
            <ThemeToggleBtn />
            <NavbarAction />
          </div>
        </div>
      </div>
    </nav>
  )
}
