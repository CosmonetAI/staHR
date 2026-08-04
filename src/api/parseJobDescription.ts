import { ParsedJobDescription } from '../types/job'

export interface UploadResult {
  success: boolean
  data?: ParsedJobDescription
  error?: string
}

export async function parseJobDescriptionFile(file: File, onProgress?: (p: number) => void, retries = 2): Promise<UploadResult> {
  const edgeBase = String(import.meta.env.VITE_EDGE_FUNCTIONS_URL || import.meta.env.VITE_FUNCTIONS_BASE || '')
  if (!edgeBase) return { success: false, error: 'Edge function base URL not configured' }
  const url = `${edgeBase.replace(/\/$/, '')}/parse-job-description`

  const form = new FormData()
  form.append('file', file, file.name)

  try {
    // Use fetch; browsers don't expose granular upload progress for fetch/FormData reliably.
    const res = await fetch(url, {
      method: 'POST',
      body: form,
      headers: {
        // include apikey for Supabase function if available
        'apikey': String(import.meta.env.VITE_SUPABASE_ANON_KEY || '')
      }
    })

    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      return { success: false, error: `Server error: ${res.status} ${txt}` }
    }

    const json = await res.json()
    return { success: true, data: json }
  } catch (e: any) {
    if (retries > 0) {
      await new Promise(r => setTimeout(r, 1200))
      return parseJobDescriptionFile(file, onProgress, retries - 1)
    }
    return { success: false, error: e?.message || String(e) }
  }
}

export default parseJobDescriptionFile
