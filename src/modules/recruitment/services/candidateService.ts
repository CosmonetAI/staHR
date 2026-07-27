import { supabase } from '../../../supabase/supabaseClient'
import { Candidate } from '../../../types'

const EDGE_IMPORT_URL = import.meta.env.VITE_EDGE_IMPORT_URL || ''

function normalizeSelectionStatus(value: any) {
  const s = String(value || '').trim().toLowerCase()
  if (!s) return 'progress'
  if (s.includes('reject')) return 'rejected'
  if (s.includes('select') || s.includes('offer')) return 'selected'
  if (s.includes('hold')) return 'hold'
  if (s.includes('drop')) return 'dropped'
  if (s.includes('progress') || s.includes('process') || s.includes('pending') || s.includes('round') || s.includes('interview')) return 'progress'
  return 'progress'
}

async function postEdge(path: string, body: any, method = 'POST') {
  if (!EDGE_IMPORT_URL) throw new Error('VITE_EDGE_IMPORT_URL is not configured. Set VITE_EDGE_IMPORT_URL to your Edge Function URL')
  const url = EDGE_IMPORT_URL + path
  try { console.debug('postEdge: calling', { url, method, bodyPreview: Array.isArray(body) ? `array(${body.length})` : typeof body }) } catch (e) {}
  // include public anon key and user token (if available) so the Functions gateway accepts the request
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const anon = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '')
  if (anon) {
    // include multiple header names to satisfy gateway/proxies
    headers['apikey'] = anon
    headers['x-api-key'] = anon
    headers['x-apikey'] = anon
    headers['x-client-info'] = 'staHR-client'
  }
  try {
    const sess = await supabase.auth.getSession()
    const token = sess?.data?.session?.access_token
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    } else if (anon) {
      // include anon key as a fallback Authorization header so gateway accepts the request
      headers['Authorization'] = `Bearer ${anon}`
    }
  } catch (e) {
    // ignore if auth not available
  }

  try {
    const res = await fetch(url, {
      method,
      mode: 'cors',
      headers,
      body: method === 'GET' || method === 'HEAD' ? undefined : JSON.stringify(body)
    })
    if (!res.ok) {
      const txt = await res.text()
      console.error('postEdge: non-ok response', { status: res.status, text: txt })
      throw new Error(`Edge call failed: ${txt}`)
    }
    const json = await res.json()
    try { console.debug('postEdge: response', { status: res.status, resultPreview: Array.isArray(json) ? `array(${json.length})` : typeof json }) } catch (e) {}
    return json
  } catch (e: any) {
    console.error('postEdge: fetch error', e)
    throw e
  }
}

export const CandidateService = {
  async list(page = 1, perPage = 20) {
    try {
      const qp = `?page=${page}&perPage=${perPage}`
      const res = await postEdge(`/import_candidates${qp}`, null, 'GET')
      try { console.debug('CandidateService.list (edge) response', res) } catch (e) {}
      if (!res) return { data: [], count: 0 }
      if (Array.isArray(res)) return { data: res, count: res.length }
      if (Array.isArray(res.data)) return { data: res.data, count: res.count ?? res.data.length }
      if (Array.isArray(res.rows)) return { data: res.rows, count: res.count ?? res.rows.length }
      if (Array.isArray(res.candidates)) return { data: res.candidates, count: res.candidates.length }
      return { data: [], count: 0 }
    } catch (e: any) {
      const msg = e?.message || String(e)
      throw new Error('Failed to list candidates: ' + msg)
    }
  },
  async create(candidate: Candidate) {
    try {
      const payloadCandidate = ((c: any) => ({
        name: c.name,
        role: c.role,
        date: c.date,
        exp: c.exp,
        cctc: c.cctc,
        ectc: c.ectc,
        email: c.email,
        phone: c.phone,
        linkedin: c.linkedin,
        location: c.location,
        np: c.np,
        availability: c.availability,
        intstatus: c.intstatus,
        selstatus: normalizeSelectionStatus(c.selstatus),
        remarks: c.remarks,
        f2f: c.f2f
      }))(candidate)
      const ret = await postEdge('/import_candidates', { upload: { file_name: 'single_create', total_records: 1 }, candidates: [payloadCandidate] }, 'POST')
      if (ret && ret.inserted && ret.inserted[0]) return ret.inserted[0]
      if (Array.isArray(ret)) return ret[0]
      return ret
    } catch (e: any) {
      const msg = e?.message || String(e)
      throw new Error('Failed to create candidate: ' + msg)
    }
  },
  async createMany(candidates: Candidate[]) {
    try {
      const payload = candidates.map((c: any) => ({
        name: c.name,
        role: c.role || c.job_role,
        date: c.date,
        exp: c.exp || (c.experience ? String(c.experience) : ''),
        cctc: c.cctc || c.current_ctc,
        ectc: c.ectc || c.expected_ctc,
        email: c.email,
        phone: c.phone,
        linkedin: c.linkedin,
        location: c.location || c.current_location,
        np: c.np || c.notice_period,
        availability: c.availability,
        intstatus: c.intstatus,
        selstatus: normalizeSelectionStatus(c.selstatus),
        remarks: c.remarks,
        f2f: c.f2f
      }))
      const ret = await postEdge('/import_candidates', { upload: { file_name: 'bulk_import', total_records: payload.length }, candidates: payload }, 'POST')
      if (ret && ret.inserted) return ret.inserted
      if (Array.isArray(ret)) return ret
      return []
    } catch (e: any) {
      const msg = e?.message || String(e)
      throw new Error('Failed to import candidates: ' + msg)
    }
  },
  async update(id: string, candidate: Partial<Candidate>) {
    const normId = String(id || '').replace(/[{}]/g, '').trim()
    if (!normId) throw new Error('Invalid id')
    const payloadCandidate = {
      ...candidate,
      ...(candidate.selstatus ? { selstatus: normalizeSelectionStatus(candidate.selstatus) } : {})
    }
    try { console.debug('CandidateService.update', { id: normId, candidate: payloadCandidate }) } catch (e) {}
    try {
      const res = await postEdge('/import_candidates', { id: normId, candidate: payloadCandidate }, 'PATCH')
      if (res && res.updated && res.updated.length) return res.updated[0]
      if (res && res.updated) return res.updated
      if (Array.isArray(res)) return res[0] || null
      return res || null
    } catch (e: any) {
      const msg = e?.message || String(e)
      throw new Error('Failed to update candidate: ' + msg)
    }
  },
  async remove(id: string) {
    const normId = String(id || '').replace(/[{}]/g, '').trim()
    if (!normId) throw new Error('Invalid id')
    try { console.debug('CandidateService.remove', { id: normId }) } catch (e) {}
    try {
      const res = await postEdge('/import_candidates', { id: normId }, 'DELETE')
      if (res && (res.deleted || res.deleted === 0)) return res.deleted > 0
      return true
    } catch (e: any) {
      const msg = e?.message || String(e)
      throw new Error('Failed to delete candidate: ' + msg)
    }
  }
}
