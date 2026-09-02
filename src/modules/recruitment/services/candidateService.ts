import { supabase } from '../../../supabase/supabaseClient'
import { Candidate } from '../../../types'

const EDGE_IMPORT_URL = import.meta.env.VITE_EDGE_IMPORT_URL || ''

function normalizeSelectionStatus(value: any) {
  const raw = String(value || '').trim()
  const s = raw.toLowerCase()
  // If the incoming value already matches one of the new enum labels (case-insensitive), preserve its original casing
  const NEW_LABELS = [
    'Pre-screening in-progress',
    'Pre-screening done and submitted for evaluation',
    'Evaluation in-progress',
    'Evaluation done and submitted for sharing with client',
    'Profile shared with client',
    'Scheduled for L1 discussion',
    'Scheduled for L2 discussion',
    'Scheduled for L3 discussion',
    'Candidate shortlisted',
    'On hold',
    'Rejected',
    'Dropped Out'
  ]
  for (const lbl of NEW_LABELS) {
    if (lbl.toLowerCase() === s) return lbl
  }

  // Map legacy short tokens to the new descriptive enum labels
  if (!s) return 'Pre-screening in-progress'
  if (s === 'progress' || s === 'in-progress' || s.includes('progress') || s.includes('process') || s.includes('pending')) return 'Pre-screening in-progress'
  if (s === 'hold' || s.includes('hold')) return 'On hold'
  if (s === 'selected' || s.includes('select') || s.includes('offer')) return 'Candidate shortlisted'
  if (s === 'rejected' || s.includes('reject')) return 'Rejected'
  if (s === 'dropped' || s.includes('drop')) return 'Dropped Out'
  // Handle common synonyms (e.g. 'no-show' or 'no show')
  if (s.includes('no') && s.includes('show')) return 'Dropped Out'

  // Unknown/custom values are normalized to a safe default enum value to avoid DB errors
  return 'Pre-screening in-progress'
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
      try {
        const parsed = JSON.parse(txt)
        const e: any = new Error('Edge call failed')
        e.response = parsed
        e.status = res.status
        throw e
      } catch (_e) {
        throw new Error(`Edge call failed: ${txt}`)
      }
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
        interview_slot: c.interview_slot || c.interview_slot_raw || '',
        confirmed_availability: c.confirmed_availability || c.confirmed_availability_raw || '',
        intstatus: c.intstatus,
        selstatus: normalizeSelectionStatus(c.selstatus),
        remarks: c.remarks,
        client_feedback: c.client_feedback || null,
        resume_url: c.resume_url || c.resume || null,
        profile_sourcing_id: c.profile_sourcing_id || c.profile_sourcing || null,
        profile_sourcing: c.profile_sourcing || null,
        consultant_id: c.consultant_id || c.consultant || null,
        consultant: c.consultant || null,
        applied_job_id: c.applied_job_id,
        applied_job_title: c.applied_job_title,
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
        interview_slot: c.interview_slot || c.interview_slot_raw || '',
        confirmed_availability: c.confirmed_availability || c.confirmed_availability_raw || '',
        intstatus: c.intstatus,
        selstatus: normalizeSelectionStatus(c.selstatus),
        remarks: c.remarks,
        client_feedback: c.client_feedback || null,
        resume_url: c.resume_url || c.resume || null,
        profile_sourcing_id: c.profile_sourcing_id || c.profile_sourcing || null,
        profile_sourcing: c.profile_sourcing || null,
        consultant_id: c.consultant_id || c.consultant || null,
        consultant: c.consultant || null,
        applied_job_id: c.applied_job_id || c.job_id || null,
        applied_job_title: c.applied_job_title || c.job_title || c.job_role || c.role || null,
        f2f: c.f2f
      }))
      const ret = await postEdge('/import_candidates', { upload: { file_name: 'bulk_import', total_records: payload.length }, candidates: payload }, 'POST')
      // Normalize response: prefer explicit inserted/updated arrays from the edge function
      const inserted: any[] = (ret && ret.inserted) ? ret.inserted : (Array.isArray(ret) ? ret : [])
      const updated: any[] = (ret && ret.updated) ? ret.updated : []
      try {
        // Attach meta counts to the returned array so callers can read inserted/updated counts
        ;(inserted as any).__importMeta = { inserted: inserted.length, updated: updated.length, insertedRows: inserted, updatedRows: updated }
      } catch (e) {}
      return inserted
    } catch (e: any) {
      console.error('CandidateService.createMany error', e)
      throw e
    }
  },
  async update(id: string, candidate: Partial<Candidate>) {
    const normId = String(id || '').replace(/[{}]/g, '').trim()
    if (!normId) throw new Error('Invalid id')
    const payloadCandidate: any = { ...candidate }
    if (payloadCandidate.selstatus) payloadCandidate.selstatus = normalizeSelectionStatus(payloadCandidate.selstatus)
    try { console.debug('CandidateService.update', { id: normId, candidate: payloadCandidate }) } catch (e) {}
    try {
      // send updates under `updates` key so edge function handles it consistently
      const res = await postEdge('/import_candidates', { id: normId, updates: payloadCandidate }, 'PATCH')
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
