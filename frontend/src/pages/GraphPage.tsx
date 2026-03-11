import { useState } from "react"
import { GitBranch, Network, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { queryVaultGraph, type GraphEdge, type GraphNode } from "@/lib/query"

export default function GraphPage() {
  const [query, setQuery] = useState("machine learning")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [nodes, setNodes] = useState<GraphNode[]>([])
  const [edges, setEdges] = useState<GraphEdge[]>([])
  const [terms, setTerms] = useState<string[]>([])
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [selectedEdgeKey, setSelectedEdgeKey] = useState<string | null>(null)
  const [relationFilter, setRelationFilter] = useState<string>("ALL")
  const [showEdgeLabels, setShowEdgeLabels] = useState(false)
  const [hideGenericRelated, setHideGenericRelated] = useState(true)
  const [minWeight, setMinWeight] = useState(1)
  const [maxEdges, setMaxEdges] = useState(24)
  const [zoom, setZoom] = useState(2.1)

  async function handleSearch(e?: React.FormEvent) {
    e?.preventDefault()
    const trimmed = query.trim()
    if (!trimmed) return

    setLoading(true)
    setError("")
    try {
      const response = await queryVaultGraph(trimmed, 30)
      setNodes(response.graph.nodes)
      setEdges(response.graph.edges)
      setTerms(response.terms)
      setSelectedNode(null)
      setSelectedEdgeKey(null)
    } catch (err: any) {
      setError(err?.message || "Failed to load graph")
      setNodes([])
      setEdges([])
      setTerms([])
    } finally {
      setLoading(false)
    }
  }

  const relationOptions = ["ALL", ...Array.from(new Set(edges.map((edge) => edge.relation))).sort()]
  const relationFilteredEdges =
    relationFilter === "ALL" ? edges : edges.filter((edge) => edge.relation === relationFilter)
  const hasNonGenericRelations = relationFilteredEdges.some((edge) => edge.relation !== "RELATED_TO")
  const visibleEdges = relationFilteredEdges
    .filter((edge) => (hideGenericRelated && hasNonGenericRelations ? edge.relation !== "RELATED_TO" : true))
    .filter((edge) => edge.weight >= minWeight)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, maxEdges)
  const visibleNodeIds = new Set(visibleEdges.flatMap((edge) => [edge.source, edge.target]))
  const visibleNodes = nodes.filter((node) => visibleNodeIds.size === 0 || visibleNodeIds.has(node.id))
  const network = buildNetworkLayout(visibleNodes, visibleEdges)
  const selectedEdge =
    selectedEdgeKey == null
      ? null
      : visibleEdges.find((edge) => getEdgeKey(edge) === selectedEdgeKey) ?? null
  const selectedNodeData =
    selectedNode == null ? null : nodes.find((node) => node.id === selectedNode) ?? null

  return (
    <div className="space-y-6">
      <div className="mb-2 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Knowledge Graph</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Inspect entities and relationships extracted from your vault.
          </p>
        </div>
        <div className="hidden md:flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-sm text-muted-foreground">
          <Network className="w-4 h-4" />
          Graph Explorer
        </div>
      </div>

      <Card className="glass-card ui-rise">
        <CardHeader>
          <CardTitle>Search the Graph</CardTitle>
          <CardDescription>Query concepts, people, or topics to inspect graph connections.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSearch} className="flex flex-col gap-3 md:flex-row">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Try: machine learning, healthcare ai, project"
              className="h-11"
            />
            <Button type="submit" className="h-11 min-w-32" disabled={loading || !query.trim()}>
              <Search className="w-4 h-4" />
              {loading ? "Searching..." : "Search"}
            </Button>
          </form>
          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
          {terms.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {terms.map((term) => (
                <span key={term} className="rounded-full border border-border bg-muted px-3 py-1 text-xs">
                  {term}
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <Card className="glass-card ui-rise">
          <CardHeader>
            <CardTitle>Entity Map</CardTitle>
            <CardDescription>Interactive network view of entities and their relationships.</CardDescription>
          </CardHeader>
          <CardContent>
            {nodes.length === 0 ? (
              <div className="flex min-h-80 items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 text-sm text-muted-foreground">
                Search the graph to see entities.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  {relationOptions.map((option) => (
                    <Button
                      key={option}
                      type="button"
                      variant={relationFilter === option ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        setRelationFilter(option)
                        setSelectedEdgeKey(null)
                      }}
                    >
                      {option}
                    </Button>
                  ))}
                </div>
                <div className="grid gap-3 rounded-xl border border-border/70 bg-card/60 p-3 md:grid-cols-2 xl:grid-cols-4">
                  <label className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-muted-foreground">Min edge weight</span>
                    <select
                      value={minWeight}
                      onChange={(e) => setMinWeight(Number(e.target.value))}
                      className="rounded-md border border-border bg-background px-2 py-1"
                    >
                      <option value={0}>0+</option>
                      <option value={1}>1+</option>
                      <option value={2}>2+</option>
                      <option value={3}>3+</option>
                    </select>
                  </label>
                  <label className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-muted-foreground">Max edges</span>
                    <select
                      value={maxEdges}
                      onChange={(e) => setMaxEdges(Number(e.target.value))}
                      className="rounded-md border border-border bg-background px-2 py-1"
                    >
                      <option value={16}>16</option>
                      <option value={24}>24</option>
                      <option value={40}>40</option>
                      <option value={80}>80</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={hideGenericRelated}
                      onChange={(e) => setHideGenericRelated(e.target.checked)}
                    />
                    Hide RELATED_TO
                  </label>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={showEdgeLabels}
                      onChange={(e) => setShowEdgeLabels(e.target.checked)}
                    />
                    Show edge labels
                  </label>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-card/60 p-2">
                  <p className="text-xs text-muted-foreground">
                    Zoom: {(zoom * 100).toFixed(0)}%
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setZoom((z) => Math.max(0.6, Number((z - 0.1).toFixed(2))))}
                    >
                      Zoom Out
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setZoom(2.1)}
                    >
                      Reset
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setZoom((z) => Math.min(2.4, Number((z + 0.1).toFixed(2))))}
                    >
                      Zoom In
                    </Button>
                  </div>
                </div>

                <div className="relative overflow-hidden rounded-2xl border bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.08),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.08),transparent_32%)] p-3">
                  <svg
                    viewBox="0 0 1000 640"
                    className="h-[520px] w-full"
                    onWheel={(e) => {
                      e.preventDefault()
                      setZoom((z) => {
                        const next = e.deltaY > 0 ? z - 0.08 : z + 0.08
                        return Math.max(0.6, Math.min(2.4, Number(next.toFixed(2))))
                      })
                    }}
                  >
                    <g transform={`translate(500 320) scale(${zoom}) translate(-500 -320)`}>
                    {network.edges.map((edge) => {
                      const source = network.nodeMap.get(edge.source)
                      const target = network.nodeMap.get(edge.target)
                      if (!source || !target) return null
                      const isActive = selectedEdgeKey === getEdgeKey(edge)
                      return (
                        <g key={getEdgeKey(edge)}>
                          <line
                            x1={source.x}
                            y1={source.y}
                            x2={target.x}
                            y2={target.y}
                            stroke={isActive ? "hsl(var(--primary))" : "rgba(148, 163, 184, 0.55)"}
                            strokeWidth={isActive ? 3 : Math.min(1 + edge.weight * 0.35, 4)}
                            onClick={() => {
                              setSelectedEdgeKey(getEdgeKey(edge))
                              setSelectedNode(null)
                            }}
                            className="cursor-pointer"
                          />
                          {showEdgeLabels && (
                            <text
                              x={(source.x + target.x) / 2}
                              y={(source.y + target.y) / 2 - 6}
                              textAnchor="middle"
                              className="fill-muted-foreground text-[10px]"
                            >
                              {edge.relation}
                            </text>
                          )}
                        </g>
                      )
                    })}

                    {network.nodes.map((node) => {
                      const isActive = selectedNode === node.id
                      const palette = getNodePalette(node.type, isActive)
                      return (
                        <g
                          key={node.id}
                          onClick={() => {
                            setSelectedNode(node.id)
                            setSelectedEdgeKey(null)
                          }}
                          className="cursor-pointer"
                        >
                          <circle
                            cx={node.x}
                            cy={node.y}
                            r={isActive ? 30 : 24}
                            fill={palette.fill}
                            stroke={palette.stroke}
                            strokeWidth={isActive ? 3 : 2}
                          />
                          <text x={node.x} y={node.y - 1} textAnchor="middle" fill={palette.label} className="text-[10px] font-semibold">
                            {truncateLabel(node.id, 10)}
                          </text>
                          <text x={node.x} y={node.y + 12} textAnchor="middle" fill={palette.meta} className="text-[9px]">
                            {node.type}
                          </text>
                        </g>
                      )
                    })}
                    </g>
                  </svg>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-border bg-card/70 p-4">
                    <p className="text-sm font-medium">Selected node</p>
                    {selectedNodeData ? (
                      <div className="mt-2 text-sm">
                        <p>{selectedNodeData.id}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                          {selectedNodeData.type}
                        </p>
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-muted-foreground">Click a node to inspect it.</p>
                    )}
                  </div>

                  <div className="rounded-xl border border-border bg-card/70 p-4">
                    <p className="text-sm font-medium">Selected edge</p>
                    {selectedEdge ? (
                      <div className="mt-2 text-sm">
                        <p>
                          {selectedEdge.source} {"-["}{selectedEdge.relation}{"]->"} {selectedEdge.target}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">Weight {selectedEdge.weight}</p>
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-muted-foreground">Click an edge to inspect provenance.</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="glass-card ui-rise">
          <CardHeader>
            <CardTitle>Connections</CardTitle>
            <CardDescription>Strongest relationships found for the current query.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {edges.length === 0 ? (
              <div className="flex min-h-80 items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 text-sm text-muted-foreground">
                No graph edges yet for this query.
              </div>
            ) : (
              visibleEdges.map((edge, index) => (
                <div
                  key={`${edge.source}-${edge.target}-${index}`}
                  className={`ui-lift rounded-xl border bg-card/80 p-4 ${
                    selectedEdgeKey === getEdgeKey(edge) ? "border-primary" : "border-border"
                  }`}
                >
                  <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <GitBranch className="w-3.5 h-3.5" />
                    {edge.relation} | weight {edge.weight}
                  </div>
                  <p className="text-sm font-medium">
                    {edge.source} {"-["}{edge.relation}{"]->"} {edge.target}
                  </p>
                  {edge.evidence.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {edge.evidence.map((item) => (
                        <div key={item.chunkId} className="rounded-lg border border-border/70 bg-muted/20 p-2">
                          <p className="text-xs font-medium">{item.citation}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {item.text.length > 160 ? `${item.text.slice(0, 160)}...` : item.text}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function getEdgeKey(edge: Pick<GraphEdge, "source" | "target" | "relation">) {
  return `${edge.source}|${edge.relation}|${edge.target}`
}

function truncateLabel(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max - 1)}...` : value
}

function getNodeStroke(type: string, active: boolean) {
  if (active) return "hsl(var(--primary))"
  if (type === "person") return "rgb(245 158 11)"
  if (type === "organization") return "rgb(14 165 233)"
  if (type === "topic") return "rgb(16 185 129)"
  return "rgba(148, 163, 184, 0.8)"
}

function getNodePalette(type: string, active: boolean) {
  const stroke = getNodeStroke(type, active)
  return {
    fill: active ? "rgb(255 255 255)" : "rgb(248 250 252)",
    stroke,
    label: "rgb(15 23 42)",
    meta: "rgb(71 85 105)",
  }
}

function buildNetworkLayout(nodes: GraphNode[], edges: GraphEdge[]) {
  const width = 1000
  const height = 640
  const centerX = width / 2
  const centerY = height / 2

  if (nodes.length === 0) {
    return {
      nodes: [] as Array<GraphNode & { x: number; y: number }>,
      edges,
      nodeMap: new Map<string, GraphNode & { x: number; y: number }>(),
    }
  }

  const degreeMap = new Map<string, number>()
  for (const node of nodes) degreeMap.set(node.id, 0)
  for (const edge of edges) {
    degreeMap.set(edge.source, (degreeMap.get(edge.source) ?? 0) + 1)
    degreeMap.set(edge.target, (degreeMap.get(edge.target) ?? 0) + 1)
  }

  const sorted = [...nodes].sort((a, b) => (degreeMap.get(b.id) ?? 0) - (degreeMap.get(a.id) ?? 0))
  const rings: GraphNode[][] = []
  if (sorted.length > 0) {
    rings.push([sorted[0]!])
  }
  let cursor = 1
  let ringIndex = 1
  while (cursor < sorted.length) {
    const capacity = Math.max(8, ringIndex * 10)
    rings.push(sorted.slice(cursor, cursor + capacity))
    cursor += capacity
    ringIndex += 1
  }

  const radiusStep = 96
  const positioned = rings.flatMap((ringNodes, rIdx) => {
    if (rIdx === 0) {
      const node = ringNodes[0]!
      return [{ ...node, x: centerX, y: centerY }]
    }
    const radius = radiusStep * rIdx
    return ringNodes.map((node, idx) => {
      const angle = (Math.PI * 2 * idx) / Math.max(ringNodes.length, 1)
      return {
        ...node,
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius,
      }
    })
  })

  return {
    nodes: positioned,
    edges,
    nodeMap: new Map(positioned.map((node) => [node.id, node])),
  }
}
