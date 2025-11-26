import { useState } from "react"
import { Button } from "../ui/button"
import { Input } from "../ui/input"

interface ComposerProps {
  onSendMessage: (text: string) => void
}

export default function Composer({ onSendMessage }: ComposerProps) {
  const [message, setMessage] = useState("")

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!message.trim()) return
    
    onSendMessage(message)
    setMessage("")
  }

  return (
    <form onSubmit={handleSubmit} className="p-4 border-t border-border bg-card">
      <div className="flex gap-2">
        <Input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type a message..."
          className="flex-1"
        />
        <Button type="submit" disabled={!message.trim()}>
          Send
        </Button>
      </div>
    </form>
  )
}
