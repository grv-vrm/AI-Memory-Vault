import { Outlet, NavLink, useNavigate } from "react-router-dom"
import { BrainCircuit, FileUp, FolderKanban, LogOut, MoonStar, Sun, X } from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { useAuth } from "@/lib/AuthContext"
import { useTheme } from "@/lib/ThemeContext"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { updateProfileName } from "@/lib/auth"

const NAV_ITEMS = [
  { to: "/upload", label: "Upload", icon: FileUp },
  { to: "/search", label: "Memory Search", icon: BrainCircuit },
  { to: "/documents", label: "Documents", icon: FolderKanban },
]

export default function VaultShell() {
  const navigate = useNavigate()
  const { user, logout, refreshUser } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [profileOpen, setProfileOpen] = useState(false)
  const [nameDraft, setNameDraft] = useState(user?.name ?? "")
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileError, setProfileError] = useState("")

  useEffect(() => {
    setNameDraft(user?.name ?? "")
  }, [user?.name])

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

  async function handleSaveProfile() {
    const nextName = nameDraft.trim()
    if (!nextName) {
      setProfileError("Name cannot be empty")
      return
    }
    setSavingProfile(true)
    setProfileError("")
    try {
      await updateProfileName(nextName)
      await refreshUser()
      setProfileOpen(false)
    } catch (error: any) {
      setProfileError(error?.message || "Failed to update name")
    } finally {
      setSavingProfile(false)
    }
  }

  return (
    <div className="h-screen overflow-hidden bg-background text-foreground">
      <div className="flex h-full w-full gap-2 p-0">
        <aside
          className={cn(
            "h-full w-[250px] shrink-0 overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground"
          )}
        >
          <div className="flex h-full flex-col">
            <div className="border-b border-sidebar-border p-3">
              <div className="mb-3 flex items-center gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleTheme}
                    title="Switch logo mode"
                    className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/20 text-primary"
                  >
                    {theme === "dark" ? <MoonStar className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
                  </button>
                  <div>
                    <p className="text-sm font-semibold leading-tight">AI Memory Vault</p>
                    <p className="text-xs text-muted-foreground">Personal second brain</p>
                  </div>
                </div>
              </div>
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
                        isActive
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
                      )
                    }
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{item.label}</span>
                  </NavLink>
                )
              })}
            </nav>

            <div className="border-t border-sidebar-border p-3">
              <button
                type="button"
                className="mb-2 flex w-full items-center gap-2 rounded-xl bg-card/60 p-2 text-left transition-colors hover:bg-card"
                onClick={() => {
                  setProfileError("")
                  setProfileOpen(true)
                }}
              >
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{user?.name ?? "User"}</p>
                  <p className="truncate text-xs text-muted-foreground">{user?.email ?? ""}</p>
                </div>
              </button>
              <Button variant="outline" className="w-full justify-start gap-2" onClick={handleLogout}>
                <LogOut className="h-4 w-4" />
                <span>Log out</span>
              </Button>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1 overflow-hidden">
          <div className="flex h-full flex-col border-l border-border bg-card p-4 md:p-6">
            <Outlet />
          </div>
        </main>
      </div>

      {profileOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Profile</h2>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setProfileOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-3">
              <div>
                <p className="mb-1 text-xs text-muted-foreground">Name</p>
                <Input
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  maxLength={80}
                  disabled={savingProfile}
                />
              </div>
              <div>
                <p className="mb-1 text-xs text-muted-foreground">Email</p>
                <Input value={user?.email ?? ""} disabled />
              </div>
              {profileError && <p className="text-xs text-destructive">{profileError}</p>}
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setProfileOpen(false)}
                disabled={savingProfile}
              >
                Cancel
              </Button>
              <Button type="button" onClick={handleSaveProfile} disabled={savingProfile}>
                {savingProfile ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
