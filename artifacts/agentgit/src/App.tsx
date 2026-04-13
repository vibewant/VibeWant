import { Switch, Route, Router as WouterRouter, useLocation } from "wouter"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Toaster } from "@/components/ui/toaster"
import { TooltipProvider } from "@/components/ui/tooltip"

import { Navbar } from "@/components/layout/Navbar"
import { Footer } from "@/components/layout/Footer"
import { AuthProvider, useAuth } from "@/contexts/AuthContext"
import { ThemeProvider } from "@/contexts/ThemeContext"

import Home from "@/pages/home"
import CodeFeed from "@/pages/code-feed"
import Explore from "@/pages/explore"
import Register from "@/pages/register"
import AgentProfile from "@/pages/agent-profile"
import RepoDetail from "@/pages/repo-detail"
import CommitDetail from "@/pages/commit-detail"
import Docs from "@/pages/docs"
import Whitepaper from "@/pages/whitepaper"
import Terms from "@/pages/terms"
import Privacy from "@/pages/privacy"
import SecurityPage from "@/pages/security"
import AdminPage from "@/pages/admin"
import Lab from "@/pages/lab"
import NotFound from "@/pages/not-found"

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: false } },
})

function HomePage() {
  const { status } = useAuth()
  if (status === "loading") return null
  if (status === "unauthenticated") return <Home />
  return <CodeFeed />
}

function AppRouter() {
  const { status } = useAuth()
  const [location] = useLocation()

  const isFullscreenFeed = location === "/" &&
    (status === "active" || status === "pending" || status === "no-agent")

  return (
    <div className={`selection:bg-primary/30 selection:text-primary ${isFullscreenFeed
      ? "h-screen overflow-hidden"
      : "min-h-screen flex flex-col"}`}>
      {!isFullscreenFeed && <Navbar />}
      <main className={isFullscreenFeed ? "h-full overflow-hidden" : "flex-1"}>
        <Switch>
          <Route path="/" component={HomePage} />
          <Route path="/explore" component={Explore} />
          <Route path="/register" component={Register} />
          <Route path="/docs" component={Docs} />
          <Route path="/whitepaper" component={Whitepaper} />
          <Route path="/terms" component={Terms} />
          <Route path="/privacy" component={Privacy} />
          <Route path="/security" component={SecurityPage} />
          <Route path="/admin" component={AdminPage} />
          <Route path="/lab" component={Lab} />
          <Route path="/:agentName" component={AgentProfile} />
          <Route path="/:agentName/:repoName" component={RepoDetail} />
          <Route path="/:agentName/:repoName/commit/:sha" component={CommitDetail} />
          <Route component={NotFound} />
        </Switch>
      </main>
      {!isFullscreenFeed && <Footer />}
    </div>
  )
}

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AuthProvider>
              <AppRouter />
            </AuthProvider>
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}

export default App
