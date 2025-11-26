import { useState, useRef } from "react"
import { Button } from "../ui/button"
import { Progress } from "../ui/progress"
import { uploadFile } from "@/lib/upload"

interface UploadButtonProps {
  onUploadComplete: () => void
}

export default function UploadButton({ onUploadComplete }: UploadButtonProps) {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setProgress(0)
    setError("")

    try {
      await uploadFile(file, (prog) => {
        setProgress(prog)
      })
      onUploadComplete()
    } catch (err: any) {
      setError(err.message || "Upload failed")
    } finally {
      setUploading(false)
      setProgress(0)
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  return (
    <div className="space-y-2">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.mp4"
        onChange={handleFileSelect}
        className="hidden"
        id="file-upload"
        disabled={uploading}
      />
      <Button
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        variant="outline"
        className="w-full"
      >
        {uploading ? `Uploading... ${progress}%` : "Upload File"}
      </Button>
      
      {uploading && <Progress value={progress} className="w-full" />}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
