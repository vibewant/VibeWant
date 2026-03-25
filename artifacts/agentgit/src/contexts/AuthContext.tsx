import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react"

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "")
export const SESSION_KEY = "vw_session_token"
export const SESSION_EMAIL_KEY = "vw_session_email"

export interface AgentStatus {
  id: number
  name: string
  avatarUrl?: string | null
  specialty?: string
  shareTokenClaimed: boolean
  shareTokenExpiresAt: string | null
}

export interface AuthState {
  sessionToken: string | null
  email: string | null
  agent: AgentStatus | null
  status: "loading" | "unauthenticated" | "no-agent" | "pending" | "active"
  isAdmin: boolean
  refresh: () => Promise<void>
  clearAuth: () => void
}

const AuthContext = createContext<AuthState>({
  sessionToken: null,
  email: null,
  agent: null,
  status: "loading",
  isAdmin: false,
  refresh: async () => {},
  clearAuth: () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sessionToken, setSessionToken] = useState<string | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [agent, setAgent] = useState<AgentStatus | null>(null)
  const [status, setStatus] = useState<AuthState["status"]>("loading")
  const [isAdmin, setIsAdmin] = useState(false)

  const clearAuth = useCallback(() => {
    localStorage.removeItem(SESSION_KEY)
    localStorage.removeItem(SESSION_EMAIL_KEY)
    setSessionToken(null)
    setEmail(null)
    setAgent(null)
    setStatus("unauthenticated")
    setIsAdmin(false)
  }, [])

  const fetchAgent = useCallback(async (token: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/agents/my-agent`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.status === 401) { clearAuth(); return }
      if (res.status === 404) {
        const body = await res.json().catch(() => ({}))
        setAgent(null)
        setStatus("no-agent")
        setIsAdmin(!!body.isAdmin)
        return
      }
      if (res.ok) {
        const data = await res.json()
        setAgent(data)
        setStatus(data.shareTokenClaimed ? "active" : "pending")
        setIsAdmin(!!data.isAdmin)
        return
      }
    } catch {}
    setAgent(null)
    setStatus("no-agent")
  }, [clearAuth])

  const refresh = useCallback(async () => {
    const token = localStorage.getItem(SESSION_KEY)
    if (!token) { setStatus("unauthenticated"); return }
    await fetchAgent(token)
  }, [fetchAgent])

  useEffect(() => {
    const token = localStorage.getItem(SESSION_KEY)
    const savedEmail = localStorage.getItem(SESSION_EMAIL_KEY)
    if (token && savedEmail) {
      setSessionToken(token)
      setEmail(savedEmail)
      fetchAgent(token)
    } else {
      setStatus("unauthenticated")
    }
  }, [fetchAgent])

  // Keep session values in sync when register page saves them
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === SESSION_KEY || e.key === SESSION_EMAIL_KEY) {
        const token = localStorage.getItem(SESSION_KEY)
        const savedEmail = localStorage.getItem(SESSION_EMAIL_KEY)
        setSessionToken(token)
        setEmail(savedEmail)
        if (token) fetchAgent(token)
        else { setAgent(null); setStatus("unauthenticated"); setIsAdmin(false) }
      }
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [fetchAgent])

  return (
    <AuthContext.Provider value={{ sessionToken, email, agent, status, isAdmin, refresh, clearAuth }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
