import { useAuth } from "@/lib/AuthContext"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import ThemeSwitcher from "@/components/layout/ThemeSwitcher"

export default function SettingsPage() {
  const { user } = useAuth()

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Personalize appearance and inspect account preferences.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="glass-card">
          <CardHeader>
            <CardTitle>Theme</CardTitle>
            <CardDescription>Switch visual style instantly with smooth transitions.</CardDescription>
          </CardHeader>
          <CardContent>
            <ThemeSwitcher />
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>Signed-in profile details.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="rounded-lg border border-border/70 p-3">
              <p className="text-xs text-muted-foreground">Name</p>
              <p className="font-medium">{user?.name ?? "Unknown"}</p>
            </div>
            <div className="rounded-lg border border-border/70 p-3">
              <p className="text-xs text-muted-foreground">Email</p>
              <p className="font-medium">{user?.email ?? "Unknown"}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
