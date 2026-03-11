import { useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "@/lib/AuthContext"

export default function AuthSuccess() {
  const navigate = useNavigate()
  const { refreshUser } = useAuth()

  useEffect(() => {
    async function handleOAuthCallback() {
      await refreshUser()
      navigate("/dashboard")
    }
    void handleOAuthCallback()
  }, [navigate, refreshUser])

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <p className="text-muted-foreground">Signing you in...</p>
    </div>
  )
}
