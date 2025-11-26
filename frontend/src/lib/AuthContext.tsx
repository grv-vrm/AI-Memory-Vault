import { createContext, useContext, useState, useEffect, type ReactNode } from "react"
import { getCurrentUser, logout as logoutApi, type User } from "./auth"

interface AuthContextType {
  user: User | null
  loading: boolean
  setUser: (user: User | null) => void
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  async function refreshUser() {
    try {
      const currentUser = await getCurrentUser()
      setUser(currentUser)
    } catch (error) {
      console.error("Failed to get current user:", error)
      setUser(null)
    }
  }

  useEffect(() => {
    async function checkAuth() {
      await refreshUser()
      setLoading(false)
    }
    checkAuth()
  }, [])

  async function logout() {
    await logoutApi()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, setUser, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
