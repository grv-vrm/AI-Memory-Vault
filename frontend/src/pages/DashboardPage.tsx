import { useEffect, useMemo, useState, type ReactNode } from "react"
import { useNavigate } from "react-router-dom"
import { BrainCircuit, FileUp, FolderKanban, Network } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { getUserFiles, type FileRecord } from "@/lib/upload"

export default function DashboardPage() {
  const navigate = useNavigate()
  const [files, setFiles] = useState<FileRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void (async () => {
      try {
        const data = await getUserFiles()
        setFiles(data)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const stats = useMemo(() => {
    const total = files.length
    const done = files.filter((f) => f.status === "done").length
    const processing = files.filter((f) => f.status === "processing").length
    const failed = files.filter((f) => f.status === "failed").length
    return { total, done, processing, failed }
  }, [files])

  const recent = files
    .slice()
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    .slice(0, 6)

  const conceptHints = buildConceptHints(files)

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Your second brain at a glance: uploads, activity, and high-signal memory trends.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 ui-rise">
        <MetricCard title="Total Memories" value={stats.total} subtitle="All files in vault" />
        <MetricCard title="Ready for Search" value={stats.done} subtitle="Processed successfully" />
        <MetricCard title="Processing" value={stats.processing} subtitle="Currently ingesting" />
        <MetricCard title="Needs Attention" value={stats.failed} subtitle="Failed ingestion" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="glass-card ui-rise">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Move fast with focused entry points.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <ActionCard
              icon={<FileUp className="h-5 w-5" />}
              title="Upload Knowledge"
              description="Drop notes, docs, and recordings."
              onClick={() => navigate("/upload")}
            />
            <ActionCard
              icon={<BrainCircuit className="h-5 w-5" />}
              title="Ask Memory"
              description="Query your vault in natural language."
              onClick={() => navigate("/search")}
            />
            <ActionCard
              icon={<FolderKanban className="h-5 w-5" />}
              title="Open Library"
              description="Browse, sort, and manage stored documents."
              onClick={() => navigate("/documents")}
            />
            <ActionCard
              icon={<Network className="h-5 w-5" />}
              title="View Connections"
              description="Explore concept relationships in your graph."
              onClick={() => navigate("/graph")}
            />
          </CardContent>
        </Card>

        <Card className="glass-card ui-rise">
          <CardHeader>
            <CardTitle>Trending Concepts</CardTitle>
            <CardDescription>Lightweight signals from filenames and tags.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {conceptHints.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Upload documents to start seeing knowledge patterns.
              </p>
            ) : (
              conceptHints.map((hint) => (
                <div key={hint.label} className="rounded-lg border border-border/70 p-3">
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="font-medium">{hint.label}</span>
                    <span className="text-xs text-muted-foreground">{hint.count}</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted">
                    <div className="h-2 rounded-full bg-primary" style={{ width: `${hint.width}%` }} />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="glass-card ui-rise">
        <CardHeader>
          <CardTitle>Recent Documents</CardTitle>
          <CardDescription>Your latest memory ingestions.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading recent documents...</p>
          ) : recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">No uploads yet.</p>
          ) : (
            recent.map((file) => (
              <div key={file.id} className="flex items-center justify-between rounded-lg border border-border/70 p-3 text-sm">
                <div>
                  <p className="font-medium">{file.filename}</p>
                  <p className="text-xs text-muted-foreground">{new Date(file.createdAt).toLocaleString()}</p>
                </div>
                <span className="rounded-full border border-border px-2 py-0.5 text-xs">{file.status}</span>
              </div>
            ))
          )}
          <Button variant="outline" className="mt-2" onClick={() => navigate("/documents")}>
            Open Full Library
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function MetricCard(props: { title: string; value: number; subtitle: string }) {
  return (
    <Card className="glass-card ui-lift">
      <CardHeader className="pb-2">
        <CardDescription>{props.title}</CardDescription>
        <CardTitle className="text-3xl">{props.value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{props.subtitle}</p>
      </CardContent>
    </Card>
  )
}

function ActionCard(props: {
  icon: ReactNode
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className="ui-lift rounded-xl border border-border/70 bg-card/60 p-4 text-left transition-all hover:border-primary/50"
    >
      <div className="mb-2 inline-flex rounded-lg bg-primary/15 p-2 text-primary">{props.icon}</div>
      <p className="text-sm font-medium">{props.title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{props.description}</p>
    </button>
  )
}

function buildConceptHints(files: FileRecord[]) {
  const counts = new Map<string, number>()
  for (const file of files) {
    const terms = file.filename
      .toLowerCase()
      .replace(/\.[a-z0-9]+$/, "")
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 4)
    for (const token of terms) {
      counts.set(token, (counts.get(token) ?? 0) + 1)
    }
  }

  const sorted = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
  const max = Math.max(1, ...sorted.map(([, count]) => count))
  return sorted.map(([label, count]) => ({
    label,
    count,
    width: Math.round((count / max) * 100),
  }))
}
