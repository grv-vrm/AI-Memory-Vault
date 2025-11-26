// src/pages/AuthSuccess.tsx
import { useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "@/lib/AuthContext"

/*
  Google callback sets cookie on backend and redirects to:
  ${FRONTEND_ORIGIN}/auth/success
  We land here — fetch /user/me from frontend or just redirect to chat.
*/
export default function AuthSuccess() {
  const navigate = useNavigate()
  const { refreshUser } = useAuth()

  useEffect(() => {
    async function handleOAuthCallback() {
      // After login, cookie is set by backend; refresh user state then go to chat
      await refreshUser()
      navigate("/chat")
    }
    handleOAuthCallback()
  }, [navigate, refreshUser])

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <p className="text-muted-foreground">Signing you in…</p>
    </div>
  )
}
