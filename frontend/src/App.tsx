// src/App.tsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import LoginPage from "./pages/LoginPage"
import ChatPage from "./pages/ChatPage"
import AuthSuccess from "./pages/AuthSuccess"
import { AuthProvider, useAuth } from "./lib/AuthContext"
import { ThemeProvider } from "./lib/ThemeContext"

function AppRoutes() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/login" element={!user ? <LoginPage /> : <Navigate to="/chat" replace />} />
      <Route path="/chat" element={user ? <ChatPage /> : <Navigate to="/login" replace />} />
      <Route path="/auth/success" element={<AuthSuccess />} />
      <Route
        path="/"
        element={
          user ? <Navigate to="/chat" replace /> : <Navigate to="/login" replace />
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}
