import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { 
  PanelLeft, 
  SquarePen, 
  Sun, 
  Moon, 
  Paperclip,
  Send,
  ChevronDown,
  LogOut,
  Library,
  Upload
} from "lucide-react"
import ChatWindow, { type Message } from "@/components/Chat/ChatWindow"
import { Sidebar, SidebarHeader, SidebarContent, SidebarFooter } from "@/components/ui/sidebar"
import LibraryView from "@/components/Chat/LibraryView"
import { useAuth } from "@/lib/AuthContext"
import { useTheme } from "@/lib/ThemeContext"
import { Input } from "@/components/ui/input"
import { uploadFile } from "@/lib/upload"

type View = "chat" | "library"

export default function ChatPage() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [messages, setMessages] = useState<Message[]>([])
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [inputValue, setInputValue] = useState("")
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [view, setView] = useState<View>("chat")
  const [isUploading, setIsUploading] = useState(false)
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

  function handleSendMessage(e: React.FormEvent) {
    e.preventDefault()
    if (!inputValue.trim()) return

    const newMessage: Message = {
      id: Date.now().toString(),
      text: inputValue,
      sender: "user",
      timestamp: new Date(),
    }
    setMessages((prev) => [...prev, newMessage])
    setInputValue("")

    // Simulate assistant response
    setTimeout(() => {
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: "I received your message. Once the backend chat endpoint is implemented, I'll be able to provide intelligent responses based on your uploaded documents.",
        sender: "assistant",
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, assistantMessage])
    }, 1000)
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
            {theme === "light" ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
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
                    disabled={isUploading}
                  />
                  
                  <Button
                    type="submit"
                    size="icon"
                    disabled={!inputValue.trim() || isUploading}
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
