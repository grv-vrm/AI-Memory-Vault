import { useState } from "react"
import { BarChart3, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { queryVaultInsights, type InsightsResponse } from "@/lib/query"

export default function InsightsPage() {
  const [days, setDays] = useState("30")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [data, setData] = useState<InsightsResponse | null>(null)

  async function loadInsights(e?: React.FormEvent) {
    e?.preventDefault()
    const parsed = Number(days)
    const safeDays = Number.isFinite(parsed) ? Math.max(1, Math.min(parsed, 3650)) : 30

    setLoading(true)
    setError("")
    try {
      const response = await queryVaultInsights(safeDays)
      setData(response)
    } catch (err: any) {
      setError(err?.message || "Failed to load insights")
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Vault Insights</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Analyze activity, top concepts, and strongest graph connections.
            </p>
          </div>
          <div className="hidden md:flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-sm text-muted-foreground">
            <BarChart3 className="w-4 h-4" />
            Analytics
          </div>
        </div>

        <Card className="glass-card ui-rise mb-6 border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle>Analysis Window</CardTitle>
            <CardDescription>Choose how many past days to include.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={loadInsights} className="flex flex-col gap-3 sm:flex-row">
              <Input
                value={days}
                onChange={(e) => setDays(e.target.value)}
                inputMode="numeric"
                placeholder="30"
                className="h-11 sm:max-w-48"
              />
              <Button type="submit" className="h-11 min-w-32" disabled={loading}>
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                {loading ? "Loading..." : "Load Insights"}
              </Button>
            </form>
            {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
          </CardContent>
        </Card>

        {data && (
          <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="space-y-6">
              <Card className="glass-card ui-rise">
                <CardHeader>
                  <CardTitle>Activity Trend</CardTitle>
                  <CardDescription>Daily files and chunks over the selected window.</CardDescription>
                </CardHeader>
                <CardContent>
                  <TrendChart data={data.trend} />
                </CardContent>
              </Card>

              <Card className="glass-card ui-rise">
                <CardHeader>
                  <CardTitle>Summary</CardTitle>
                  <CardDescription>
                    Since {new Date(data.since).toLocaleDateString()} ({data.windowDays} days)
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border bg-card/70 p-4">
                    <p className="text-xs text-muted-foreground">Files</p>
                    <p className="mt-1 text-2xl font-semibold">{data.stats.files}</p>
                  </div>
                  <div className="rounded-xl border bg-card/70 p-4">
                    <p className="text-xs text-muted-foreground">Chunks</p>
                    <p className="mt-1 text-2xl font-semibold">{data.stats.chunks}</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-card ui-rise">
                <CardHeader>
                  <CardTitle>Top Concepts</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {data.topConcepts.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No graph entities yet.</p>
                  ) : (
                    data.topConcepts.map((item, idx) => (
                      <div key={`${item.name}-${idx}`} className="rounded-lg border p-3 text-sm">
                        <p className="font-medium">{item.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.type} | mentions {item.mentions}
                        </p>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card className="glass-card ui-rise">
                <CardHeader>
                  <CardTitle>File Types</CardTitle>
                </CardHeader>
                <CardContent>
                  <BreakdownBars
                    items={data.fileTypeBreakdown.map((row) => ({
                      label: formatMimeLabel(row.mimeType),
                      value: row.count,
                    }))}
                    emptyLabel="No files in this window."
                    color="bg-cyan-500"
                  />
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card className="glass-card ui-rise">
                <CardHeader>
                  <CardTitle>Processing Status</CardTitle>
                </CardHeader>
                <CardContent>
                  <BreakdownBars
                    items={data.statusBreakdown.map((row) => ({
                      label: row.status,
                      value: row.count,
                    }))}
                    emptyLabel="No status data yet."
                    color="bg-violet-500"
                  />
                </CardContent>
              </Card>

              <Card className="glass-card ui-rise">
                <CardHeader>
                  <CardTitle>Relation Breakdown</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {data.relationBreakdown.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No relation data yet.</p>
                  ) : (
                    data.relationBreakdown.map((row, idx) => (
                      <div key={`${row.relation}-${idx}`} className="rounded-lg border p-3 text-sm">
                        <p className="font-medium">{row.relation}</p>
                        <p className="text-xs text-muted-foreground">count {row.count}</p>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card className="glass-card ui-rise">
                <CardHeader>
                  <CardTitle>Strongest Connections</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {data.strongestConnections.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No connections yet.</p>
                  ) : (
                    data.strongestConnections.map((edge, idx) => (
                      <div key={`${edge.source}-${edge.target}-${idx}`} className="rounded-lg border p-3 text-sm">
                        <p>
                          {edge.source} {"-["}{edge.relation}{"]->"} {edge.target}
                        </p>
                        <p className="text-xs text-muted-foreground">weight {edge.weight}</p>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card className="glass-card ui-rise">
                <CardHeader>
                  <CardTitle>Recent Files</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {data.recentFiles.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No files in this window.</p>
                  ) : (
                    data.recentFiles.map((file) => (
                      <div key={file.id} className="rounded-lg border p-3 text-sm">
                        <p className="font-medium">{file.filename}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(file.createdAt).toLocaleString()} | chunks {file.chunkCount}
                        </p>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}
    </div>
  )
}

function TrendChart(props: { data: Array<{ day: string; files: number; chunks: number }> }) {
  const width = 720
  const height = 220
  const padding = 26
  const chartWidth = width - padding * 2
  const chartHeight = height - padding * 2

  if (props.data.length === 0) {
    return <p className="text-sm text-muted-foreground">No trend data in this window.</p>
  }

  const maxValue = Math.max(1, ...props.data.flatMap((d) => [d.files, d.chunks]))
  const points = props.data.map((d, index) => {
    const x =
      padding +
      (props.data.length === 1 ? chartWidth / 2 : (index / (props.data.length - 1)) * chartWidth)
    const filesY = padding + chartHeight - (d.files / maxValue) * chartHeight
    const chunksY = padding + chartHeight - (d.chunks / maxValue) * chartHeight
    return { x, filesY, chunksY }
  })

  const filesPath = points
    .map((point, idx) => `${idx === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.filesY.toFixed(2)}`)
    .join(" ")
  const chunksPath = points
    .map((point, idx) => `${idx === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.chunksY.toFixed(2)}`)
    .join(" ")

  const firstDay = new Date(props.data[0]!.day).toLocaleDateString()
  const lastDay = new Date(props.data[props.data.length - 1]!.day).toLocaleDateString()

  return (
    <div className="space-y-3">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full rounded-xl border bg-card/70">
        <line
          x1={padding}
          y1={height - padding}
          x2={width - padding}
          y2={height - padding}
          stroke="rgba(148,163,184,0.55)"
          strokeWidth="1"
        />
        <line
          x1={padding}
          y1={padding}
          x2={padding}
          y2={height - padding}
          stroke="rgba(148,163,184,0.55)"
          strokeWidth="1"
        />
        <path d={filesPath} fill="none" stroke="rgb(59 130 246)" strokeWidth="2.5" />
        <path d={chunksPath} fill="none" stroke="rgb(16 185 129)" strokeWidth="2.5" />
      </svg>
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-blue-500" />
          files/day
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          chunks/day
        </span>
        <span>
          {firstDay} - {lastDay}
        </span>
      </div>
    </div>
  )
}

function BreakdownBars(props: {
  items: Array<{ label: string; value: number }>
  emptyLabel: string
  color: string
}) {
  if (props.items.length === 0) {
    return <p className="text-sm text-muted-foreground">{props.emptyLabel}</p>
  }

  const max = Math.max(1, ...props.items.map((item) => item.value))
  return (
    <div className="space-y-2">
      {props.items.map((item, idx) => (
        <div key={`${item.label}-${idx}`} className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="truncate pr-3">{item.label}</span>
            <span className="text-muted-foreground">{item.value}</span>
          </div>
          <div className="h-2 rounded-full bg-muted">
            <div
              className={`h-2 rounded-full ${props.color}`}
              style={{ width: `${Math.max(6, (item.value / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

function formatMimeLabel(mimeType: string) {
  if (!mimeType || mimeType === "unknown") return "unknown"
  if (mimeType.includes("/")) {
    const [major, minor] = mimeType.split("/")
    return `${major}:${minor}`
  }
  return mimeType
}
