import { Outlet, NavLink, useLocation, useNavigate } from "react-router-dom"
import { useState } from "react"
import { BarChart3, BookOpen, BrainCircuit, FileUp, FolderKanban, LayoutDashboard, LogOut, Menu, Network, Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { useAuth } from "@/lib/AuthContext"
import ThemeSwitcher from "./ThemeSwitcher"
import { cn } from "@/lib/utils"

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/upload", label: "Upload", icon: FileUp },
  { to: "/search", label: "Memory Search", icon: BrainCircuit },
  { to: "/documents", label: "Documents", icon: FolderKanban },
  { to: "/graph", label: "Knowledge Graph", icon: Network },
  { to: "/insights", label: "Insights", icon: BarChart3 },
  { to: "/settings", label: "Settings", icon: Settings },
]

export default function VaultShell() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuth()
  const [collapsed, setCollapsed] = useState(false)

  const initials = (user?.name ?? "U")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)

  async function handleLogout() {
    await logout()
    navigate("/login")
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-[1600px] gap-4 p-3 md:p-4">
        <aside
          className={cn(
            "glass-card sticky top-3 h-[calc(100vh-1.5rem)] shrink-0 overflow-hidden rounded-2xl border border-sidebar-border bg-sidebar text-sidebar-foreground transition-all duration-300",
            collapsed ? "w-[86px]" : "w-[290px]"
          )}
        >
          <div className="flex h-full flex-col">
            <div className="border-b border-sidebar-border p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/20 text-primary">
                    <BookOpen className="h-5 w-5" />
                  </div>
                  {!collapsed && (
                    <div>
                      <p className="text-sm font-semibold leading-tight">AI Memory Vault</p>
                      <p className="text-xs text-muted-foreground">Personal second brain</p>
                    </div>
                  )}
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCollapsed((v) => !v)}>
                  <Menu className="h-4 w-4" />
                </Button>
              </div>
              {!collapsed && <ThemeSwitcher />}
            </div>

            <nav className="flex-1 space-y-1 overflow-y-auto p-2">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      cn(
                        "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
                        isActive || location.pathname === item.to
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
                      )
                    }
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {!collapsed && <span>{item.label}</span>}
                  </NavLink>
                )
              })}
            </nav>

            <div className="border-t border-sidebar-border p-3">
              <div className="mb-2 flex items-center gap-2 rounded-xl bg-card/60 p-2">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                </Avatar>
                {!collapsed && (
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{user?.name ?? "User"}</p>
                    <p className="truncate text-xs text-muted-foreground">{user?.email ?? ""}</p>
                  </div>
                )}
              </div>
              <Button variant="outline" className="w-full justify-start gap-2" onClick={handleLogout}>
                <LogOut className="h-4 w-4" />
                {!collapsed && <span>Log out</span>}
              </Button>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <div className="glass-card min-h-[calc(100vh-1.5rem)] rounded-2xl border border-border bg-card/80 p-4 md:p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
