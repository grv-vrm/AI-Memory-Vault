import { useEffect, useState } from "react"
import { getUserFiles, FileRecord } from "@/lib/upload"
import FileItem from "./FileItem"
import UploadButton from "./UploadButton"

export default function FileList() {
  const [files, setFiles] = useState<FileRecord[]>([])
  const [loading, setLoading] = useState(true)

  async function loadFiles() {
    try {
      const data = await getUserFiles()
      setFiles(data)
    } catch (err) {
      console.error("Failed to load files:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadFiles()
    // Poll for updates every 3 seconds to check file status
    const interval = setInterval(loadFiles, 3000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border">
        <h2 className="text-lg font-semibold mb-4">Files</h2>
        <UploadButton onUploadComplete={loadFiles} />
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {loading ? (
          <p className="text-sm text-muted-foreground text-center">Loading files...</p>
        ) : files.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center">No files uploaded yet</p>
        ) : (
          files.map((file) => (
            <FileItem key={file.id} file={file} />
          ))
        )}
      </div>
    </div>
  )
}
