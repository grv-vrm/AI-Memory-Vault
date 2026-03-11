import { useEffect, useRef, useState } from "react"
import { Paperclip, ScrollText, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import ChatWindow, { type EvidenceChunk, type GraphConnection, type Message } from "@/components/Chat/ChatWindow"
import { askVault, summarizeVault } from "@/lib/query"
import { uploadFile } from "@/lib/upload"
import { createChatSession, getChatHistory, setChatRetention } from "@/lib/chat"

export default function SearchPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState("")
  const [isUploading, setIsUploading] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [showSummaryFilters, setShowSummaryFilters] = useState(false)
  const [summaryFromDate, setSummaryFromDate] = useState("")
  const [summaryToDate, setSummaryToDate] = useState("")
  const [conversationId, setConversationId] = useState<string | undefined>()
  const [retentionHours, setRetentionHours] = useState<24 | 48>(48)
  const [isLoadingHistory, setIsLoadingHistory] = useState(true)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const history = await getChatHistory()
        if (!mounted) return
        if (history.session) {
          setConversationId(history.session.id)
          setRetentionHours((history.session.retentionHours === 24 ? 24 : 48))
          setMessages(
            history.session.messages.map((msg) => ({
              id: msg.id,
              text: msg.content,
              sender: msg.role,
              timestamp: new Date(msg.createdAt),
              citations: Array.isArray(msg.metadata?.citations) ? msg.metadata.citations : undefined,
              confidence:
                typeof msg.metadata?.confidence === "number" ? msg.metadata.confidence : undefined,
              usedChunks: Array.isArray(msg.metadata?.usedChunks)
                ? (msg.metadata.usedChunks as EvidenceChunk[])
                : undefined,
              connections: Array.isArray(msg.metadata?.connections)
                ? (msg.metadata.connections as GraphConnection[])
                : undefined,
            }))
          )
          return
        }

        const created = await createChatSession(48)
        if (!mounted) return
        setConversationId(created.session.id)
      } catch (error) {
        console.error("Failed to load chat history:", error)
      } finally {
        if (mounted) setIsLoadingHistory(false)
      }
    })()

    return () => {
      mounted = false
    }
  }, [])

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault()
    const query = inputValue.trim()
    if (!query) return

    pushUserMessage(query)
    setInputValue("")
    setIsSearching(true)
    try {
      const response = await askVault({
        query,
        topK: 6,
        conversationId,
        retentionHours,
      })
      if (response.conversationId) {
        setConversationId(response.conversationId)
      }
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-assistant`,
          text: response.answer,
          sender: "assistant",
          timestamp: new Date(),
          citations: response.citations,
          confidence: response.confidence,
          usedChunks: response.usedChunks.map((chunk) => ({
            citation: chunk.citation,
            text: chunk.text,
            score: chunk.score,
            chunk: chunk.chunk,
            fileId: chunk.file.id,
          })) as EvidenceChunk[],
          connections: response.connections.map((conn) => ({
            source: conn.source,
            target: conn.target,
            relation: conn.relation,
            weight: conn.weight,
            evidence: conn.evidence ?? [],
          })) as GraphConnection[],
        },
      ])
    } catch (error: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-assistant`,
          text: `Search failed: ${error?.message || "Unknown error"}`,
          sender: "assistant",
          timestamp: new Date(),
        },
      ])
    } finally {
      setIsSearching(false)
    }
  }

  async function handleSummarize() {
    const query = inputValue.trim() || "Summarize my recent memory"
    const fromDate = summaryFromDate.trim() || undefined
    const toDate = summaryToDate.trim() || undefined

    pushUserMessage(
      fromDate || toDate ? `${query}\nRange: ${fromDate ?? "start"} to ${toDate ?? "today"}` : query
    )
    setInputValue("")
    setIsSearching(true)

    try {
      const response = await summarizeVault({
        query,
        topK: 12,
        fromDate,
        toDate,
        conversationId,
        retentionHours,
      })
      if (response.conversationId) {
        setConversationId(response.conversationId)
      }
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-assistant`,
          text:
            response.summary +
            `\n\nModel: ${response.usedFallback ? "fallback" : response.modelUsed ?? "unknown"}`,
          sender: "assistant",
          timestamp: new Date(),
          citations: response.citations,
          usedChunks: response.usedChunks.map((chunk) => ({
            citation: chunk.citation,
            text: chunk.text,
            score: chunk.score,
            chunk: chunk.chunk,
            fileId: chunk.file.id,
          })) as EvidenceChunk[],
        },
      ])
    } catch (error: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-assistant`,
          text: `Summary failed: ${error?.message || "Unknown error"}`,
          sender: "assistant",
          timestamp: new Date(),
        },
      ])
    } finally {
      setIsSearching(false)
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setIsUploading(true)
    try {
      await uploadFile(file)
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-assistant`,
          text: `Uploaded ${file.name}. I can now use it in answers once processing completes.`,
          sender: "assistant",
          timestamp: new Date(),
        },
      ])
      if (fileInputRef.current) fileInputRef.current.value = ""
    } catch (error: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-assistant`,
          text: `Upload failed: ${error?.message || "Unknown error"}`,
          sender: "assistant",
          timestamp: new Date(),
        },
      ])
    } finally {
      setIsUploading(false)
    }
  }

  function pushUserMessage(text: string) {
    setMessages((prev) => [
      ...prev,
      {
        id: `${Date.now()}-user`,
        text,
        sender: "user",
        timestamp: new Date(),
      },
    ])
  }

  return (
    <div className="flex h-[calc(100vh-5rem)] flex-col">
      <header className="mb-3 space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">Memory Search</h1>
        <p className="text-sm text-muted-foreground">
          Ask questions across your notes, lectures, and documents with grounded citations.
        </p>
        <p className="text-xs text-muted-foreground">
          Conversation memory retention: {retentionHours} hours ({retentionHours === 24 ? "1 day" : "2 days"})
        </p>
      </header>

      <div className="glass-card ui-rise flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border/70">
        <ChatWindow messages={messages} />
        <div className="border-t border-border/70 p-4">
          <form onSubmit={handleSendMessage} className="mx-auto max-w-4xl">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowSummaryFilters((v) => !v)}
                  disabled={isUploading || isSearching || isLoadingHistory}
                >
                  <ScrollText className="mr-1 h-4 w-4" />
                  Summary Filters
                </Button>
                <select
                  className="h-8 rounded-md border border-border bg-background px-2 text-xs"
                  value={retentionHours}
                  disabled={!conversationId || isUploading || isSearching || isLoadingHistory}
                  onChange={async (e) => {
                    const next = Number(e.target.value) === 24 ? 24 : 48
                    setRetentionHours(next)
                    if (!conversationId) return
                    try {
                      await setChatRetention(conversationId, next)
                    } catch (error) {
                      console.error("Failed to update chat retention:", error)
                    }
                  }}
                >
                  <option value={24}>Keep 1 day</option>
                  <option value={48}>Keep 2 days</option>
                </select>
              </div>
              {showSummaryFilters && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSummaryFromDate("")
                    setSummaryToDate("")
                  }}
                >
                  Clear
                </Button>
              )}
            </div>

            {showSummaryFilters && (
              <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Input
                  type="date"
                  value={summaryFromDate}
                  onChange={(e) => setSummaryFromDate(e.target.value)}
                  disabled={isUploading || isSearching}
                />
                <Input
                  type="date"
                  value={summaryToDate}
                  onChange={(e) => setSummaryToDate(e.target.value)}
                  disabled={isUploading || isSearching}
                />
              </div>
            )}

            <div className="ui-lift relative flex items-center gap-2 rounded-2xl border border-border bg-card/70 px-3 py-2">
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileUpload}
                className="hidden"
                accept=".pdf,.doc,.docx,.txt,.md,.csv,.json,image/*,video/*,audio/*"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading || isSearching || isLoadingHistory}
              >
                <Paperclip className="h-4 w-4" />
              </Button>
              <Input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={
                  isLoadingHistory
                    ? "Loading conversation..."
                    : isUploading
                    ? "Uploading..."
                    : "Ask your memory vault anything..."
                }
                className="border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
                disabled={isUploading || isSearching || isLoadingHistory}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleSummarize}
                disabled={isUploading || isSearching || isLoadingHistory}
              >
                Summarize
              </Button>
              <Button
                type="submit"
                size="icon"
                disabled={!inputValue.trim() || isUploading || isSearching || isLoadingHistory}
                className="rounded-full"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
