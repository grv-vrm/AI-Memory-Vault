// src/App.tsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import LoginPage from "./pages/LoginPage"
import AuthSuccess from "./pages/AuthSuccess"
import SearchPage from "./pages/SearchPage"
import UploadPage from "./pages/UploadPage"
import DocumentsPage from "./pages/DocumentsPage"
import DashboardPage from "./pages/DashboardPage"
import InsightsPage from "./pages/InsightsPage"
import VaultShell from "./components/layout/VaultShell"
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
      <Route path="/login" element={!user ? <LoginPage /> : <Navigate to="/upload" replace />} />
      <Route element={user ? <VaultShell /> : <Navigate to="/login" replace />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/upload" element={<UploadPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/documents" element={<DocumentsPage />} />
        <Route path="/graph" element={<Navigate to="/upload" replace />} />
        <Route path="/insights" element={<InsightsPage />} />
        <Route path="/settings" element={<Navigate to="/upload" replace />} />
      </Route>
      <Route path="/chat" element={<Navigate to="/search" replace />} />
      <Route path="/auth/success" element={<AuthSuccess />} />
      <Route
        path="/"
        element={
          user ? <Navigate to="/dashboard" replace /> : <Navigate to="/login" replace />
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
