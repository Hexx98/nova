import { useRef, useState } from 'react'
import clsx from 'clsx'

interface DocUploadProps {
  label: string
  description: string
  currentPath: string | null
  onUpload: (file: File) => Promise<void>
  accept?: string
}

export function DocUpload({ label, description, currentPath, onUpload, accept = '.pdf,.doc,.docx' }: DocUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const fileName = currentPath ? currentPath.split(/[\\/]/).pop() : null

  async function handleFile(file: File) {
    setError('')
    setUploading(true)
    try {
      await onUpload(file)
    } catch {
      setError('Upload failed — check file type and try again')
    } finally {
      setUploading(false)
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-200">{label}</p>
          <p className="text-xs text-nova-muted">{description}</p>
        </div>
        {fileName && (
          <div className="flex items-center gap-1.5 text-xs text-emerald-400">
            <span>✓</span>
            <span className="font-mono truncate max-w-48">{fileName}</span>
          </div>
        )}
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={clsx(
          'border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-colors',
          dragging ? 'border-nova-accent bg-nova-accent/5' : 'border-nova-border hover:border-slate-500',
          fileName ? 'bg-emerald-500/5 border-emerald-500/30' : '',
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
        />

        {uploading ? (
          <div className="flex items-center justify-center gap-2 text-sm text-nova-muted">
            <div className="w-4 h-4 border-2 border-nova-accent border-t-transparent rounded-full animate-spin" />
            Uploading...
          </div>
        ) : fileName ? (
          <p className="text-sm text-slate-400">
            Uploaded — <span className="text-nova-accent">click to replace</span>
          </p>
        ) : (
          <div>
            <p className="text-sm text-slate-400">
              Drag & drop or <span className="text-nova-accent">browse</span>
            </p>
            <p className="text-xs text-nova-muted mt-1">{accept.replace(/\./g, '').toUpperCase()}</p>
          </div>
        )}
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}
