import { useEffect, useRef } from "react"
import { ExternalLink } from "lucide-react"
import { getFileDownloadUrl } from "@/lib/upload"

export interface EvidenceChunk {
  citation: string
  text: string
  score: number
  chunk: number
  fileId?: string
}

export interface GraphConnection {
  source: string
  target: string
  weight: number
  relation: string
  evidence: Array<{
    chunkId: string
    fileId: string
    filename: string
    chunkIndex: number
    citation: string
    text: string
  }>
}

export interface Message {
  id: string
  text: string
  sender: "user" | "assistant"
  timestamp: Date
  fileIds?: string[]
  citations?: string[]
  confidence?: number
  usedChunks?: EvidenceChunk[]
  connections?: GraphConnection[]
}

interface ChatWindowProps {
  messages: Message[]
}

function collectFileSources(msg: Message): Array<{ label: string; fileId?: string }> {
  const fromChunks = (msg.usedChunks ?? [])
    .filter((chunk) => Boolean(chunk.citation))
    .map((chunk) => ({
      label: chunk.citation.split("#chunk-")[0] ?? chunk.citation,
      fileId: chunk.fileId,
    }));

  const fallbackFromCitations =
    fromChunks.length === 0
      ? (msg.citations ?? []).map((citation) => ({
          label: citation.split("#chunk-")[0] ?? citation,
          fileId: undefined,
        }))
      : [];

  const merged = [...fromChunks, ...fallbackFromCitations];
  const unique = new Map<string, { label: string; fileId?: string }>();

  for (const item of merged) {
    const key = item.label.trim().toLowerCase();
    if (!key) continue;
    const existing = unique.get(key);
    if (!existing) {
      unique.set(key, item);
      continue;
    }
    if (!existing.fileId && item.fileId) {
      unique.set(key, item);
    }
  }

  return Array.from(unique.values());
}

export default function ChatWindow({ messages }: ChatWindowProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  async function openFile(fileId?: string) {
    if (!fileId) return
    try {
      const url = await getFileDownloadUrl(fileId)
      window.open(url, "_blank", "noopener,noreferrer")
    } catch (error) {
      console.error("Failed to open cited file:", error)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.length === 0 ? (
        <div className="flex items-center justify-center h-full text-muted-foreground">
          <p>Start a conversation or upload a file</p>
        </div>
      ) : (
        messages.map((msg) => (
          (() => {
            const fileSources = collectFileSources(msg)
            return (
              <div
                key={msg.id}
                className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-2 ${
                    msg.sender === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  }`}
                >
              <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
              {msg.sender === "assistant" && typeof msg.confidence === "number" && (
                <p className="text-xs mt-2 opacity-80">
                  Confidence: {(msg.confidence * 100).toFixed(0)}%
                </p>
              )}
              {msg.sender === "assistant" && fileSources.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {fileSources.map((source) => (
                    <button
                      key={source.label}
                      type="button"
                      onClick={() => openFile(source.fileId)}
                      disabled={!source.fileId}
                      className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-background/70 border border-border hover:border-primary/60"
                    >
                      {source.label}
                      <ExternalLink className="h-3 w-3" />
                    </button>
                  ))}
                </div>
              )}
              {msg.sender === "assistant" && msg.usedChunks && msg.usedChunks.length > 0 && (
                <details className="mt-2 rounded-md border border-border bg-background/40 p-2">
                  <summary className="cursor-pointer text-xs font-medium">
                    Evidence ({msg.usedChunks.length} chunks)
                  </summary>
                  <div className="mt-2 space-y-2">
                    {msg.usedChunks.map((chunk, index) => (
                      <div key={`${chunk.citation}-${index}`} className="text-xs">
                        <p className="font-medium">
                          {chunk.citation} | score {chunk.score.toFixed(3)}
                        </p>
                        {chunk.fileId && (
                          <button
                            type="button"
                            onClick={() => openFile(chunk.fileId)}
                            className="mt-1 inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-[11px] hover:border-primary/60"
                          >
                            Open source
                            <ExternalLink className="h-3 w-3" />
                          </button>
                        )}
                        <p className="opacity-90 whitespace-pre-wrap">
                          {chunk.text.length > 220 ? `${chunk.text.slice(0, 220)}...` : chunk.text}
                        </p>
                      </div>
                    ))}
                  </div>
                </details>
              )}
              {msg.sender === "assistant" && msg.connections && msg.connections.length > 0 && (
                <details className="mt-2 rounded-md border border-border bg-background/40 p-2">
                  <summary className="cursor-pointer text-xs font-medium">
                    Connections ({msg.connections.length})
                  </summary>
                  <div className="mt-2 space-y-1">
                    {msg.connections.map((conn, index) => (
                      <div key={`${conn.source}-${conn.target}-${index}`} className="text-xs rounded-md border border-border p-2">
                        <p>
                          {conn.source} {"-["}{conn.relation}{"]->"} {conn.target} (w={conn.weight})
                        </p>
                        {(conn.evidence ?? []).length > 0 && (
                          <div className="mt-1 space-y-1 opacity-90">
                            {(conn.evidence ?? []).map((item) => (
                              <div key={item.chunkId}>
                                <p className="font-medium">{item.citation}</p>
                                <p className="whitespace-pre-wrap">
                                  {item.text.length > 140 ? `${item.text.slice(0, 140)}...` : item.text}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </details>
              )}
              <p className="text-xs opacity-70 mt-1">
                {msg.timestamp.toLocaleTimeString()}
              </p>
            </div>
              </div>
            )
          })()
        ))
      )}
      <div ref={messagesEndRef} />
    </div>
  )
}
