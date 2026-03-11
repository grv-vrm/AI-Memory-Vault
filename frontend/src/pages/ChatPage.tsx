import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { 
  PanelLeft, 
  SquarePen, 
  Palette, 
  Paperclip,
  Send,
  ScrollText,
  ChevronDown,
  LogOut,
  Library,
  Upload,
  Network,
  BarChart3
} from "lucide-react"
import ChatWindow, {
  type EvidenceChunk,
  type GraphConnection,
  type Message,
} from "@/components/Chat/ChatWindow"
import { Sidebar, SidebarHeader, SidebarContent, SidebarFooter } from "@/components/ui/sidebar"
import LibraryView from "@/components/Chat/LibraryView"
import { useAuth } from "@/lib/AuthContext"
import { useTheme } from "@/lib/ThemeContext"
import { Input } from "@/components/ui/input"
import { uploadFile } from "@/lib/upload"
import { askVault, summarizeVault } from "@/lib/query"

type View = "chat" | "library"

export default function ChatPage() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { toggleTheme } = useTheme()
  const [messages, setMessages] = useState<Message[]>([])
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [inputValue, setInputValue] = useState("")
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [view, setView] = useState<View>("chat")
  const [isUploading, setIsUploading] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [summaryFromDate, setSummaryFromDate] = useState("")
  const [summaryToDate, setSummaryToDate] = useState("")
  const [showSummaryFilters, setShowSummaryFilters] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleLogout() {
    await logout()
    navigate("/login")
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploading(true)
    try {
      await uploadFile(file)
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    } catch (err) {
      console.error("Upload failed:", err)
    } finally {
      setIsUploading(false)
    }
  }

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault()
    const query = inputValue.trim()
    if (!query) return

    const newMessage: Message = {
      id: Date.now().toString(),
      text: query,
      sender: "user",
      timestamp: new Date(),
    }
    setMessages((prev) => [...prev, newMessage])
    setInputValue("")
    setIsSearching(true)

    try {
      const response = await askVault(query, 5)
      const assistantText = response.answer

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: assistantText,
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
        connections: response.connections.map((c) => ({
          source: c.source,
          target: c.target,
          weight: c.weight,
          relation: c.relation,
          evidence: c.evidence ?? [],
        })) as GraphConnection[],
      }
      setMessages((prev) => [...prev, assistantMessage])
    } catch (error: any) {
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: `Search failed: ${error?.message || "Unknown error"}`,
        sender: "assistant",
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, assistantMessage])
    } finally {
      setIsSearching(false)
    }
  }

  async function handleSummarize() {
    const query = inputValue.trim() || "Summarize my recent memory"
    const fromDate = summaryFromDate.trim() || undefined
    const toDate = summaryToDate.trim() || undefined

    const userTextParts = [query]
    if (fromDate || toDate) {
      userTextParts.push(`Range: ${fromDate ?? "start"} to ${toDate ?? "today"}`)
    }

    const newMessage: Message = {
      id: Date.now().toString(),
      text: userTextParts.join("\n"),
      sender: "user",
      timestamp: new Date(),
    }
    setMessages((prev) => [...prev, newMessage])
    setInputValue("")
    setIsSearching(true)

    try {
      let response
      try {
        response = await summarizeVault({
          query,
          topK: 12,
          fromDate,
          toDate,
        })
      } catch (summaryError: any) {
        const message = String(summaryError?.message ?? "")
        // Backward compatibility when backend process is older than summarize route.
        if (message.includes("Cannot POST /query/summarize")) {
          const askFallback = await askVault(`Summarize this from memory vault: ${query}`, 8)
          response = {
            ok: true,
            query,
            summary: askFallback.answer,
            citations: askFallback.citations,
            usedChunks: askFallback.usedChunks,
            filters: { fromDate: fromDate ?? null, toDate: toDate ?? null },
            stats: {
              chunksUsed: askFallback.usedChunks.length,
              filesUsed: new Set(askFallback.usedChunks.map((chunk) => chunk.file.id)).size,
            },
          }
        } else {
          throw summaryError
        }
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: response.summary,
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
      }
      setMessages((prev) => [...prev, assistantMessage])
    } catch (error: any) {
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: `Summary failed: ${error?.message || "Unknown error"}`,
        sender: "assistant",
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, assistantMessage])
    } finally {
      setIsSearching(false)
    }
  }

  if (!user) return null

  const initials = user.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)

  return (
    <div className="h-screen flex bg-background">
      {/* Sidebar */}
      <Sidebar collapsed={!sidebarOpen}>
        <SidebarHeader>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2"
            onClick={() => setView("chat")}
          >
            <SquarePen className="w-4 h-4" />
            <span>New chat</span>
          </Button>
        </SidebarHeader>
        
        <SidebarContent>
          <div className="space-y-1">
            <Button
              variant={view === "library" ? "secondary" : "ghost"}
              size="sm"
              className="w-full justify-start gap-2"
              onClick={() => setView("library")}
            >
              <Library className="w-4 h-4" />
              <span>Library</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2"
              onClick={() => navigate("/graph")}
            >
              <Network className="w-4 h-4" />
              <span>Graph</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2"
              onClick={() => navigate("/insights")}
            >
              <BarChart3 className="w-4 h-4" />
              <span>Insights</span>
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileUpload}
              className="hidden"
              accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.gif,.mp4,.mov"
            />
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              <Upload className="w-4 h-4" />
              <span>{isUploading ? "Uploading..." : "Upload File"}</span>
            </Button>
          </div>
        </SidebarContent>

        <SidebarFooter>
          <div className="flex items-center gap-2">
            <Avatar className="w-7 h-7">
              <AvatarImage src="" />
              <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user.name}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setShowUserMenu(!showUserMenu)}
            >
              <ChevronDown className="w-4 h-4" />
            </Button>
          </div>
          
          {showUserMenu && (
            <div className="mt-2 p-1 rounded-md border bg-popover">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start gap-2 text-destructive hover:text-destructive"
                onClick={handleLogout}
              >
                <LogOut className="w-4 h-4" />
                Log out
              </Button>
            </div>
          )}
        </SidebarFooter>
      </Sidebar>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="h-8 w-8"
            >
              <PanelLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-lg font-semibold">
              {view === "library" ? "Library" : "AI Memory Vault"}
            </h1>
          </div>
          
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="h-8 w-8"
          >
            <Palette className="w-5 h-5" />
          </Button>
        </header>

        {/* Content Area */}
        {view === "library" ? (
          <LibraryView />
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            <ChatWindow messages={messages} />
            
            {/* Input Area */}
            <div className="p-4">
              <form onSubmit={handleSendMessage} className="max-w-3xl mx-auto">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowSummaryFilters((prev) => !prev)}
                      disabled={isUploading || isSearching}
                    >
                      <ScrollText className="w-4 h-4" />
                      Summary Filters
                    </Button>
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
                      disabled={isUploading || isSearching}
                    >
                      Clear dates
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
                <div className="relative flex items-center gap-2 rounded-3xl border border-border bg-card shadow-sm px-4 py-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    onChange={handleFileUpload}
                    className="hidden"
                    accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.gif,.mp4,.mov"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                  >
                    <Paperclip className="w-5 h-5" />
                  </Button>
                  
                  <Input
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder={isUploading ? "Uploading..." : "Message AI Memory Vault"}
                    className="border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 px-0"
                    disabled={isUploading || isSearching}
                  />
                  
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isUploading || isSearching}
                    onClick={handleSummarize}
                  >
                    Summarize
                  </Button>

                  <Button
                    type="submit"
                    size="icon"
                    disabled={!inputValue.trim() || isUploading || isSearching}
                    className="h-8 w-8 rounded-full"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
