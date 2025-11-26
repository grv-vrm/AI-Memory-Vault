import { apiFetch } from "../api"

export interface PresignResponse {
  ok: boolean
  path: string
  token?: string
  signedUploadUrl: string
}

export interface FileRecord {
  id: string
  key: string
  filename: string
  mimeType: string
  size: number
  status: "uploaded" | "processing" | "done" | "failed"
  createdAt: string
  updatedAt: string
}

export interface CompleteUploadResponse {
  ok: boolean
  file: FileRecord
}

export async function presignUpload(
  filename: string,
  mimeType: string
): Promise<PresignResponse> {
  return await apiFetch("/upload/presign", {
    method: "POST",
    body: JSON.stringify({ filename, mimeType })
  })
}

export async function uploadToSignedUrl(
  signedUrl: string,
  file: File,
  onProgress?: (loaded: number, total: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("PUT", signedUrl)
    xhr.setRequestHeader("Content-Type", file.type)
    
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(e.loaded, e.total)
      }
    }
    
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve()
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`))
      }
    }
    
    xhr.onerror = () => reject(new Error("Upload failed"))
    xhr.send(file)
  })
}

export async function completeUpload(
  path: string,
  filename: string,
  mimeType: string,
  size: number
): Promise<CompleteUploadResponse> {
  return await apiFetch("/upload/complete", {
    method: "POST",
    body: JSON.stringify({ path, filename, mimeType, size })
  })
}

export async function getUserFiles(): Promise<FileRecord[]> {
  const res = await apiFetch("/user/files", { method: "GET" })
  return res.files || []
}

export async function uploadFile(
  file: File,
  onProgress?: (progress: number) => void
): Promise<FileRecord> {
  // Step 1: Get presigned URL
  const presignRes = await presignUpload(file.name, file.type)
  
  // Step 2: Upload directly to storage
  await uploadToSignedUrl(presignRes.signedUploadUrl, file, (loaded, total) => {
    if (onProgress) {
      onProgress(Math.round((loaded / total) * 100))
    }
  })
  
  // Step 3: Complete upload on backend
  const completeRes = await completeUpload(
    presignRes.path,
    file.name,
    file.type,
    file.size
  )
  
  return completeRes.file
}

export async function getFileDownloadUrl(fileId: string): Promise<string> {
  const res = await apiFetch(`/user/files/${fileId}/download`, { method: "GET" })
  return res.url
}
