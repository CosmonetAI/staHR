import React, { useState, useRef } from 'react'
import parseJobDescriptionFile from '../../api/parseJobDescription'
import { ParsedJobDescription } from '../../types/job'

type Props = {
  onParsed: (data: ParsedJobDescription) => void
}

const ACCEPTED = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain']
const MAX_SIZE = 10 * 1024 * 1024 // 10 MB

export default function JobDescriptionUploader({ onParsed }: Props) {
  const [dragOver, setDragOver] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  function validateFile(f: File) {
    if (!ACCEPTED.includes(f.type) && !f.name.match(/\.(pdf|docx|doc|txt)$/i)) {
      return 'Unsupported file type. Supported: pdf, doc, docx, txt'
    }
    if (f.size > MAX_SIZE) return 'File exceeds maximum size of 10 MB'
    return null
  }

  async function handleFile(f: File) {
    setError(null)
    const v = validateFile(f)
    if (v) { setError(v); return }
    setFile(f)
    setLoading(true)
    setProgress(10)
    try {
      const res = await parseJobDescriptionFile(f, (p) => setProgress(p))
      if (!res.success) {
        setError(res.error || 'Failed to parse file')
      } else {
        onParsed(res.data as ParsedJobDescription)
      }
    } catch (e: any) {
      setError(e?.message || String(e))
    } finally {
      setLoading(false)
      setProgress(100)
    }
  }

  function onDrop(ev: React.DragEvent) {
    ev.preventDefault()
    setDragOver(false)
    const f = ev.dataTransfer.files && ev.dataTransfer.files[0]
    if (f) handleFile(f)
  }

  function onSelectFile() {
    inputRef.current?.click()
  }

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragEnter={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={(e) => { e.preventDefault(); setDragOver(false) }}
        onDrop={onDrop}
        style={{ border: dragOver ? '2px dashed #1976d2' : '2px dashed #ccc', padding: 12, borderRadius: 6, cursor: 'pointer' }}
        onClick={onSelectFile}
      >
        <input ref={inputRef} type="file" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }} accept=".pdf,.doc,.docx,.txt" />
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ fontSize: 28 }}>📄</div>
          <div>
            <div style={{ fontWeight: 600 }}>Upload job description</div>
            <div style={{ fontSize: 12, color: '#666' }}>Drag & drop or click to browse (pdf, doc, docx, txt) — max 10MB</div>
          </div>
        </div>
      </div>

      {file && (
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f3f3f3', borderRadius: 4 }}>{file.type === 'application/pdf' ? '📕' : '📄'}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>{file.name}</div>
            <div style={{ fontSize: 12, color: '#666' }}>{(file.size / 1024).toFixed(0)} KB</div>
          </div>
          <div>
            <button className="btn btn-ghost" onClick={() => { setFile(null); setError(null) }}>Remove</button>
          </div>
        </div>
      )}

      {loading && (
        <div style={{ marginTop: 8 }}>
          <div style={{ height: 8, background: '#eee', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ width: `${progress}%`, height: '100%', background: '#1976d2' }} />
          </div>
          <div style={{ fontSize: 12, color: '#666', marginTop: 6 }}>{progress < 100 ? 'Parsing…' : 'Done'}</div>
        </div>
      )}

      {error && (
        <div style={{ marginTop: 8, color: 'var(--status-rejected)' }}>
          <div>{error}</div>
          <div style={{ marginTop: 6 }}>
            <button className="btn btn-ghost" onClick={() => { setError(null); setFile(null) }}>Clear</button>
            <button className="btn btn-primary" style={{ marginLeft: 8 }} onClick={() => { if (file) handleFile(file) }}>Retry</button>
          </div>
        </div>
      )}
    </div>
  )
}
