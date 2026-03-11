import { useMemo, useState } from "react"
import { FileUp, Sparkles, Tag } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { uploadFile } from "@/lib/upload"

type UploadItem = {
  id: string
  name: string
  progress: number
  status: "uploading" | "done" | "failed"
}

export default function UploadPage() {
  const [items, setItems] = useState<UploadItem[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [pastedText, setPastedText] = useState("")
  const [savingText, setSavingText] = useState(false)

  const suggestions = useMemo(() => suggestTags(items.map((item) => item.name).join(" ")), [items])

  async function uploadSelected(files: FileList | File[]) {
    for (const file of Array.from(files)) {
      const id = `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      setItems((prev) => [...prev, { id, name: file.name, progress: 0, status: "uploading" }])
      try {
        await uploadFile(file, (progress) => {
          setItems((prev) =>
            prev.map((item) => (item.id === id ? { ...item, progress } : item))
          )
        })
        setItems((prev) =>
          prev.map((item) => (item.id === id ? { ...item, progress: 100, status: "done" } : item))
        )
      } catch {
        setItems((prev) =>
          prev.map((item) => (item.id === id ? { ...item, status: "failed" } : item))
        )
      }
    }
  }

  async function savePastedText() {
    const trimmed = pastedText.trim()
    if (!trimmed || savingText) return
    setSavingText(true)
    try {
      const blob = new Blob([trimmed], { type: "text/plain" })
      const file = new File([blob], `note-${new Date().toISOString().slice(0, 10)}.txt`, {
        type: "text/plain",
      })
      await uploadSelected([file])
      setPastedText("")
    } finally {
      setSavingText(false)
    }
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">Upload Memory</h1>
        <p className="text-sm text-muted-foreground">
          Drag files, paste notes, and let your memory vault ingest and connect knowledge.
        </p>
      </header>

      <Card className="glass-card ui-rise overflow-hidden">
        <CardHeader>
          <CardTitle>Drop Zone</CardTitle>
          <CardDescription>Supported: PDF, DOCX, TXT, audio notes, and plain text.</CardDescription>
        </CardHeader>
        <CardContent>
          <label
            className={`ui-lift group relative block cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition ${
              dragOver ? "border-primary bg-primary/10" : "border-border bg-card/60 hover:border-primary/60"
            }`}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              if (e.dataTransfer.files?.length) {
                void uploadSelected(e.dataTransfer.files)
              }
            }}
          >
            <input
              type="file"
              className="hidden"
              multiple
              accept=".pdf,.doc,.docx,.txt,.md,.csv,.json,audio/*"
              onChange={(e) => {
                if (e.target.files?.length) {
                  void uploadSelected(e.target.files)
                  e.currentTarget.value = ""
                }
              }}
            />
            <div className="ui-glow mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/15 text-primary transition-transform group-hover:scale-110">
              <FileUp className="h-7 w-7" />
            </div>
            <p className="text-sm font-medium">Drag and drop files here, or click to browse</p>
            <p className="mt-1 text-xs text-muted-foreground">Fast upload + async processing</p>
          </label>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="glass-card ui-rise">
          <CardHeader>
            <CardTitle>Upload Progress</CardTitle>
            <CardDescription>Real-time status for recent uploads.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground">No uploads yet in this session.</p>
            ) : (
              items.map((item) => (
                <div key={item.id} className="ui-lift rounded-xl border border-border/70 p-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-medium">{item.name}</p>
                    <span className="text-xs capitalize text-muted-foreground">{item.status}</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted">
                    <div
                      className={`h-2 rounded-full ${
                        item.status === "failed"
                          ? "bg-red-500"
                          : item.status === "done"
                          ? "bg-emerald-500"
                          : "bg-primary"
                      }`}
                      style={{ width: `${item.progress}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="glass-card ui-rise">
          <CardHeader>
            <CardTitle>Pasted Note</CardTitle>
            <CardDescription>Quickly save text snippets into your vault.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <textarea
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              placeholder="Paste lecture notes, ideas, or a web article excerpt..."
              className="h-40 w-full rounded-xl border border-input bg-background/70 p-3 text-sm outline-none ring-0 transition focus:border-primary"
            />
            <div className="flex items-center gap-2">
              <Button onClick={savePastedText} disabled={!pastedText.trim() || savingText}>
                {savingText ? "Saving..." : "Save Note"}
              </Button>
              <Button variant="ghost" onClick={() => setPastedText("")}>
                Clear
              </Button>
            </div>
            <div className="ui-lift rounded-xl border border-border/70 bg-card/70 p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                <Sparkles className="h-4 w-4 text-primary" />
                Suggested Tags
              </div>
              <div className="flex flex-wrap gap-2">
                {suggestions.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Upload files to generate tag suggestions.</p>
                ) : (
                  suggestions.map((tag) => (
                    <span key={tag} className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1 text-xs">
                      <Tag className="h-3 w-3" />
                      {tag}
                    </span>
                  ))
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function suggestTags(input: string) {
  const map = new Map<string, number>()
  const tokens = input
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4)

  for (const token of tokens) {
    map.set(token, (map.get(token) ?? 0) + 1)
  }

  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([token]) => token)
}
