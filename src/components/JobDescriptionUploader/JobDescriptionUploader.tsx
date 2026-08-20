import React, { useState, useRef } from 'react'
import parseJobDescriptionFile from '../../api/parseJobDescription'
import { supabase } from '../../supabase/supabaseClient'
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import { ParsedJobDescription } from '../../types/job'

type Props = {
  onParsed: (data: ParsedJobDescription) => void
  onUploaded?: (info: { path: string, publicUrl?: string }) => void
}

const ACCEPTED = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain']
const MAX_SIZE = 10 * 1024 * 1024 // 10 MB

export default function JobDescriptionUploader({ onParsed, onUploaded }: Props) {
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
      // If PDF, extract text client-side and send as text to the edge function
      if (f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')) {
        try {
          try {
            GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.js', import.meta.url).toString()
          } catch (e) {
            // ignore worker setup errors
          }

          const arrayBuffer = await f.arrayBuffer()
          const pdf = await getDocument({ data: arrayBuffer }).promise
          let fullText = ''
          for (let i = 1; i <= pdf.numPages; i++) {
            try {
              const page = await pdf.getPage(i)
              const content = await page.getTextContent()
              const pageText = content.items.map((it: any) => String(it.str)).join(' ')
              fullText += (fullText ? '\n\n' : '') + pageText
            } catch (e) {
              // continue on page-level errors
            }
          }

          console.debug('PDF extraction finished, length=', String(fullText?.length || 0))

          // If extracted text is very small, attempt OCR as a fallback
          let finalText = fullText || ''
          try {
            if (String(finalText).trim().length < 50) {
              console.debug('Extracted text is short; attempting OCR fallback')
              try {
                const { createWorker } = await import('tesseract.js')
                const worker = createWorker({ logger: m => { /* optional progress logger */ } })
                await worker.load()
                await worker.loadLanguage('eng')
                await worker.initialize('eng')

                let ocrText = ''
                for (let i = 1; i <= pdf.numPages; i++) {
                  try {
                    const page = await pdf.getPage(i)
                    const viewport = page.getViewport({ scale: 2 })
                    const canvas = document.createElement('canvas')
                    canvas.width = Math.floor(viewport.width)
                    canvas.height = Math.floor(viewport.height)
                    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D
                    await page.render({ canvasContext: ctx, viewport }).promise
                    const { data: { text: pageOcr } } = await worker.recognize(canvas)
                    ocrText += (ocrText ? '\n\n' : '') + (pageOcr || '')
                  } catch (e) {
                    // continue page-level OCR errors
                  }
                }

                await worker.terminate()

                if (String(ocrText).trim().length > String(finalText).trim().length) {
                  finalText = ocrText
                  console.debug('OCR produced text length=', finalText.length)
                } else {
                  console.debug('OCR did not produce more text than initial extraction')
                }
              } catch (e) {
                console.warn('OCR fallback failed', e)
              }
            }
          } catch (err) {
            console.warn('OCR detection/error', err)
          }

          const res = await parseJobDescriptionFile(finalText, (p) => setProgress(p))
          if (!res.success) {
            setError(res.error || 'Failed to parse file')
          } else {
            // attempt to upload original file to storage
            try {
              setProgress(60)
              const bucket = String(import.meta.env.VITE_JOB_FILES_BUCKET || 'job-files')
              const filePath = `${bucket}/${Date.now()}_${f.name.replace(/[^a-zA-Z0-9_.-]/g, '_')}`
              const { error: uploadError } = await supabase.storage.from(bucket).upload(filePath, f, { upsert: true })
              if (!uploadError) {
                try {
                  const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(filePath)
                  const publicUrl = (publicData && (publicData.publicUrl || publicData.public_url || (publicData as any).publicURL)) || undefined
                  setProgress(90)
                  onParsed(res.data as ParsedJobDescription)
                  if (typeof onUploaded === 'function') {
                    onUploaded({ path: filePath, publicUrl })
                  }
                } catch (e) {
                  setProgress(90)
                  onParsed(res.data as ParsedJobDescription)
                  if (typeof onUploaded === 'function') {
                    onUploaded({ path: filePath })
                  }
                }
              } else {
                // upload failed, still return parsed data
                setError(uploadError.message || 'Failed to upload file')
                onParsed(res.data as ParsedJobDescription)
              }
            } catch (err) {
              // ignore upload errors, but still return parsed data
              try { onParsed(res.data as ParsedJobDescription) } catch(e) {}
            }
          }
        } catch (err: any) {
          setError(err?.message || String(err) || 'Failed to extract text from PDF')
        }
      } else {
        const res = await parseJobDescriptionFile(f, (p) => setProgress(p))
        if (!res.success) {
          setError(res.error || 'Failed to parse file')
        } else {
          // upload original file to storage
          try {
            setProgress(60)
            const bucket = String(import.meta.env.VITE_JOB_FILES_BUCKET || 'job-files')
            const filePath = `${bucket}/${Date.now()}_${f.name.replace(/[^a-zA-Z0-9_.-]/g, '_')}`
            const { error: uploadError } = await supabase.storage.from(bucket).upload(filePath, f, { upsert: true })
            if (!uploadError) {
              try {
                const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(filePath)
                const publicUrl = (publicData && (publicData.publicUrl || publicData.public_url || (publicData as any).publicURL)) || undefined
                setProgress(90)
                onParsed(res.data as ParsedJobDescription)
                if (typeof onUploaded === 'function') {
                  onUploaded({ path: filePath, publicUrl })
                }
              } catch (e) {
                setProgress(90)
                onParsed(res.data as ParsedJobDescription)
                if (typeof onUploaded === 'function') {
                  onUploaded({ path: filePath })
                }
              }
            } else {
              setError(uploadError.message || 'Failed to upload file')
              onParsed(res.data as ParsedJobDescription)
            }
          } catch (err) {
            try { onParsed(res.data as ParsedJobDescription) } catch(e) {}
          }
        }
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
