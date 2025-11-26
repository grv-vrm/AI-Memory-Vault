import { Badge } from "../ui/badge"
import { FileRecord } from "@/lib/upload"

interface FileItemProps {
  file: FileRecord
}

export default function FileItem({ file }: FileItemProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case "done":
        return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
      case "processing":
        return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
      case "failed":
        return "bg-red-500/20 text-red-400 border-red-500/30"
      default:
        return "bg-sky-500/20 text-sky-400 border-sky-500/30"
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B"
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB"
    return (bytes / (1024 * 1024)).toFixed(1) + " MB"
  }

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{file.filename}</p>
        <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
      </div>
      <Badge className={getStatusColor(file.status)}>
        {file.status}
      </Badge>
    </div>
  )
}
