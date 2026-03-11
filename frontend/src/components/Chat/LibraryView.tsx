import { useEffect, useState } from "react"
import { getUserFiles, getFileDownloadUrl, deleteUserFiles, reprocessFile, type FileRecord } from "@/lib/upload"
import { FileText, Image, Video, FileIcon, Download, Trash2, CheckSquare, Square, RotateCcw } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

export default function LibraryView() {
  const [files, setFiles] = useState<FileRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [fileUrls, setFileUrls] = useState<Record<string, string>>({})
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [deleting, setDeleting] = useState(false)
  const [reprocessingId, setReprocessingId] = useState<string | null>(null)

  async function loadFiles() {
    try {
      const data = await getUserFiles()
      setFiles(data)
      
      // Load signed URLs for image/video previews
      const urls: Record<string, string> = {}
      for (const file of data) {
        if (file.mimeType.startsWith("image/") || file.mimeType.startsWith("video/")) {
          try {
            urls[file.id] = await getFileDownloadUrl(file.id)
          } catch (err) {
            console.error(`Failed to get URL for file ${file.id}:`, err)
          }
        }
      }
      setFileUrls(urls)
    } catch (err) {
      console.error("Failed to load files:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadFiles()
  }, [])

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith("image/")) return <Image className="w-5 h-5" />
    if (mimeType.startsWith("video/")) return <Video className="w-5 h-5" />
    if (mimeType === "application/pdf") return <FileText className="w-5 h-5" />
    return <FileIcon className="w-5 h-5" />
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "done":
        return "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
      case "processing":
        return "bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30"
      case "failed":
        return "bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30"
      default:
        return "bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/30"
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B"
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB"
    return (bytes / (1024 * 1024)).toFixed(1) + " MB"
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return "Just now"
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  const getStorageUrl = (file: FileRecord) => {
    return fileUrls[file.id] || ""
  }

  const handleFileClick = async (file: FileRecord) => {
    if (selectionMode) {
      toggleSelect(file.id)
      return
    }

    try {
      const url = await getFileDownloadUrl(file.id)
      window.open(url, "_blank")
    } catch (err) {
      console.error("Failed to get download URL:", err)
      alert("Failed to open file. Please try again.")
    }
  }

  function toggleSelect(fileId: string) {
    setSelectedIds((prev) =>
      prev.includes(fileId) ? prev.filter((id) => id !== fileId) : [...prev, fileId]
    )
  }

  async function handleDeleteSelected() {
    if (selectedIds.length === 0 || deleting) return

    const confirmDelete = window.confirm(
      `Delete ${selectedIds.length} selected file(s)? This action cannot be undone.`
    )
    if (!confirmDelete) return

    setDeleting(true)
    try {
      await deleteUserFiles(selectedIds)
      setSelectedIds([])
      setSelectionMode(false)
      await loadFiles()
    } catch (err) {
      console.error("Failed to delete files:", err)
      alert("Failed to delete selected files. Please try again.")
    } finally {
      setDeleting(false)
    }
  }

  async function handleReprocess(fileId: string) {
    if (reprocessingId) return
    setReprocessingId(fileId)
    try {
      await reprocessFile(fileId)
      await loadFiles()
    } catch (err) {
      console.error("Failed to reprocess file:", err)
      alert("Failed to reprocess file. Please try again.")
    } finally {
      setReprocessingId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading library...</p>
      </div>
    )
  }

  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <FileIcon className="w-16 h-16 text-muted-foreground/50" />
        <p className="text-muted-foreground">No files uploaded yet</p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          {selectionMode ? `${selectedIds.length} selected` : `${files.length} files`}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSelectionMode((prev) => !prev)
              setSelectedIds([])
            }}
          >
            {selectionMode ? "Cancel" : "Select"}
          </Button>
          {selectionMode && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeleteSelected}
              disabled={selectedIds.length === 0 || deleting}
            >
              <Trash2 className="w-4 h-4 mr-1" />
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {files.map((file) => {
          const isImage = file.mimeType.startsWith("image/")
          const isVideo = file.mimeType.startsWith("video/")
          const storageUrl = getStorageUrl(file)
          const isSelected = selectedIds.includes(file.id)

          return (
            <div
              key={file.id}
              className={`group relative border rounded-lg overflow-hidden bg-card hover:shadow-lg transition-all cursor-pointer ${isSelected ? "ring-2 ring-primary" : ""}`}
              onClick={() => handleFileClick(file)}
            >
              {selectionMode && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleSelect(file.id)
                  }}
                  className="absolute top-2 right-2 z-10 rounded-md bg-black/60 p-1 text-white"
                >
                  {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                </button>
              )}

              {/* Preview */}
              <div className="aspect-video bg-muted flex items-center justify-center relative overflow-hidden">
                {isImage ? (
                  <img
                    src={storageUrl}
                    alt={file.filename}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : isVideo ? (
                  <video
                    src={storageUrl}
                    className="w-full h-full object-cover"
                    preload="metadata"
                  />
                ) : (
                  <div className="text-muted-foreground">
                    {getFileIcon(file.mimeType)}
                  </div>
                )}
                
                {/* Overlay on hover */}
                <div className={`absolute inset-0 bg-black/60 transition-opacity flex items-center justify-center ${selectionMode ? "opacity-0" : "opacity-0 group-hover:opacity-100"}`}>
                  <Download className="w-8 h-8 text-white" />
                </div>
              </div>

              {/* Info */}
              <div className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-medium truncate flex-1" title={file.filename}>
                    {file.filename}
                  </h3>
                  <Badge className={getStatusColor(file.status)} variant="outline">
                    {file.status}
                  </Badge>
                </div>
                
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{formatFileSize(file.size)}</span>
                  <span>{formatDate(file.createdAt)}</span>
                </div>

                {file.status === "failed" && (
                  <div className="space-y-2">
                    {file.error && (
                      <p className="text-xs text-red-600 dark:text-red-400 line-clamp-3">
                        {file.error}
                      </p>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleReprocess(file.id)
                      }}
                      disabled={reprocessingId === file.id}
                    >
                      <RotateCcw className="w-4 h-4 mr-1" />
                      {reprocessingId === file.id ? "Reprocessing..." : "Reprocess"}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
