import { useTheme, type VaultTheme } from "@/lib/ThemeContext"
import { Button } from "@/components/ui/button"

const THEMES: Array<{ id: VaultTheme; label: string }> = [
  { id: "light-productivity", label: "Light" },
  { id: "dark-knowledge", label: "Dark" },
  { id: "glassmorphism", label: "Glass" },
  { id: "gradient-ai", label: "Gradient" },
  { id: "minimal-focus", label: "Focus" },
]

export default function ThemeSwitcher() {
  const { theme, setTheme } = useTheme()

  return (
    <div className="flex flex-wrap gap-1 rounded-xl border border-border bg-card/70 p-1">
      {THEMES.map((item) => (
        <Button
          key={item.id}
          type="button"
          size="sm"
          variant={theme === item.id ? "default" : "ghost"}
          className="h-7 rounded-lg px-2 text-xs"
          onClick={() => setTheme(item.id)}
        >
          {item.label}
        </Button>
      ))}
    </div>
  )
}
