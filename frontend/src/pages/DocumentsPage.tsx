import LibraryView from "@/components/Chat/LibraryView"

export default function DocumentsPage() {
  return (
    <div className="flex h-[calc(100vh-5rem)] flex-col">
      <header className="mb-3 space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">Document Library</h1>
        <p className="text-sm text-muted-foreground">
          Browse, filter, reprocess, and manage everything stored in your vault.
        </p>
      </header>
      <div className="glass-card min-h-0 flex-1 overflow-hidden rounded-2xl border border-border/70">
        <LibraryView />
      </div>
    </div>
  )
}
