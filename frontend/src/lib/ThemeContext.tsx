import { createContext, useContext, useEffect, useState, type ReactNode } from "react"

export type VaultTheme =
  | "light-productivity"
  | "dark-knowledge"
  | "glassmorphism"
  | "gradient-ai"
  | "minimal-focus"

const THEME_CLASSES: VaultTheme[] = [
  "light-productivity",
  "dark-knowledge",
  "glassmorphism",
  "gradient-ai",
  "minimal-focus",
]

interface ThemeContextType {
  theme: VaultTheme
  setTheme: (theme: VaultTheme) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<VaultTheme>(() => {
    const stored = localStorage.getItem("theme")
    return (stored as VaultTheme) || "light-productivity"
  })

  useEffect(() => {
    const root = document.documentElement
    root.classList.remove(...THEME_CLASSES, "dark")
    root.classList.add(theme)
    if (theme === "dark-knowledge" || theme === "glassmorphism" || theme === "gradient-ai") {
      root.classList.add("dark")
    }
    localStorage.setItem("theme", theme)
  }, [theme])

  const toggleTheme = () => {
    setTheme((prev) => {
      const index = THEME_CLASSES.indexOf(prev)
      const nextIndex = (index + 1) % THEME_CLASSES.length
      return THEME_CLASSES[nextIndex] ?? "light-productivity"
    })
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider")
  }
  return context
}
