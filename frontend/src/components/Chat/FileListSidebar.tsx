import { type FileRecord } from "@/lib/upload"
import { FileText, Image as ImageIcon, Video, File, Check, Clock, AlertCircle, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface FileListSidebarProps {
  files: FileRecord[]
  loading?: boolean
}

export default function FileListSidebar({ files, loading }: FileListSidebarProps) {
  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith("image/")) return <ImageIcon className="w-4 h-4" />
    if (mimeType.startsWith("video/")) return <Video className="w-4 h-4" />
    if (mimeType === "application/pdf") return <FileText className="w-4 h-4" />
    return <File className="w-4 h-4" />
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "done":
        return <Check className="w-3 h-3 text-emerald-500" />
      case "processing":
        return <Loader2 className="w-3 h-3 text-amber-500 animate-spin" />
      case "failed":
        return <AlertCircle className="w-3 h-3 text-red-500" />
      default:
        return <Clock className="w-3 h-3 text-blue-500" />
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return "Just now"
    if (diffMins < 60) return `${diffMins}m`
    if (diffHours < 24) return `${diffHours}h`
    if (diffDays < 7) return `${diffDays}d`
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-32 text-center px-4">
        <File className="w-8 h-8 text-muted-foreground/50 mb-2" />
        <p className="text-xs text-muted-foreground">No files yet</p>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      {files.map((file) => (
        <div
          key={file.id}
          className={cn(
            "group flex items-center gap-2 p-2 rounded-lg hover:bg-accent/50 cursor-pointer transition-colors"
          )}
        >
          <div className="text-muted-foreground">
            {getFileIcon(file.mimeType)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm truncate">{file.filename}</p>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              {getStatusIcon(file.status)}
              <span>{formatDate(file.createdAt)}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
