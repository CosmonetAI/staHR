// import_candidates edge function
// Expects a JSON body: { upload: {file_name, total_records, uploaded_by}, candidates: [...] }

import { serve } from 'https://deno.land/std@0.203.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js'

const SUPABASE_URL = Deno.env.get('PROJECT_SUPABASE_URL') || Deno.env.get('SUPABASE_URL') || Deno.env.get('VITE_SUPABASE_URL')
const SUPABASE_ANON_KEY = Deno.env.get('PROJECT_SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('VITE_SUPABASE_ANON_KEY')
const SUPABASE_SERVICE_ROLE = Deno.env.get('PROJECT_SUPABASE_SERVICE_ROLE') || Deno.env.get('SUPABASE_SERVICE_ROLE') || Deno.env.get('VITE_SUPABASE_SERVICE_ROLE')

let sb: any = null
let sbAdmin: any = null
if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  sb = createClient(String(SUPABASE_URL), String(SUPABASE_ANON_KEY))
} else {
  console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables')
}
if (SUPABASE_URL && SUPABASE_SERVICE_ROLE) {
  try {
    sbAdmin = createClient(String(SUPABASE_URL), String(SUPABASE_SERVICE_ROLE))
  } catch (e) {
    console.warn('Failed to create admin Supabase client', e)
    sbAdmin = null
  }
}

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

serve(async (req) => {
  // CORS handling
  const origin = req.headers.get('origin') || '*'
  const corsHeaders = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    // include all header names the client may send so preflight succeeds
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-api-key, x-apikey, x-client-info',
    'Access-Control-Allow-Credentials': 'true'
  }

  // handle preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (!sb) return new Response(JSON.stringify({ error: 'Server misconfiguration: missing SUPABASE_URL or SUPABASE_ANON_KEY' }), { status: 500, headers: corsHeaders })

    try {
    // Debug: log presence of auth headers (do not log the secret values)
    const hasApiKey = Boolean(req.headers.get('apikey') || req.headers.get('x-api-key') || req.headers.get('x-apikey'))
    const hasAuth = Boolean(req.headers.get('authorization'))
    console.log('auth header presence', { hasApiKey, hasAuth })

    // determine if requester is a client user (by auth token -> clients.user_id or by email)
    let isClientUser = false
    let requestClientId: string | null = null
    try {
      const authHeader = req.headers.get('authorization') || ''
      const token = authHeader.replace(/^Bearer\s+/i, '') || null
      if (token) {
        try {
          const userRes: any = await sb.auth.getUser(token)
          const user = userRes?.data?.user || null
          const userId = user?.id || null
          const userEmail = user?.email || null
          if (userId) {
            const clientRow = await sb.from('clients').select('id').eq('user_id', userId).limit(1).maybeSingle()
            if (!clientRow.error && clientRow.data) {
              isClientUser = true
              requestClientId = clientRow.data.id
            }
          }
          if (!isClientUser && userEmail) {
            const clientRow2 = await sb.from('clients').select('id').eq('email', userEmail).limit(1).maybeSingle()
            if (!clientRow2.error && clientRow2.data) {
              isClientUser = true
              requestClientId = clientRow2.data.id
            }
          }
        } catch (e) {
          // ignore
        }
      }
    } catch (e) {
      console.warn('failed to detect client user', e)
    }

    // handle GET - list or single
    if (req.method === 'GET') {
      const u = new URL(req.url)
      const id = u.searchParams.get('id')
      const page = Number(u.searchParams.get('page') || '1')
      const perPage = Number(u.searchParams.get('perPage') || '50')
      if (id) {
        const { data, error } = await sb.from('candidates').select('*').eq('id', id).single()
        if (error) return new Response(JSON.stringify({ error: error.message || error }), { status: 500, headers: corsHeaders })
        return new Response(JSON.stringify({ data }), { status: 200, headers: corsHeaders })
      }
      const from = (page - 1) * perPage
      const to = from + perPage - 1
      // attempt to detect client user and restrict candidates to their jobs
      let clientId: string | null = null
      try {
        const authHeader = req.headers.get('authorization') || ''
        const token = authHeader.replace(/^Bearer\s+/i, '') || null
        if (token) {
          const userRes: any = await sb.auth.getUser(token)
          const userId = userRes?.data?.user?.id || null
          if (userId) {
            const clientRow = await sb.from('clients').select('id').eq('user_id', userId).limit(1).maybeSingle()
            if (!clientRow.error && clientRow.data) clientId = clientRow.data.id
          }
        }
      } catch (e) { console.warn('failed to resolve clientId for candidates request', e) }

      if (clientId) {
        // find job ids for this client
        const { data: jobsForClient } = await sb.from('jobs').select('id').eq('client_id', clientId)
        const jobIds = (jobsForClient || []).map((j: any) => j.id)
        const query = sb.from('candidates').select('*', { count: 'estimated' }).order('created_at', { ascending: false })
        const { data, error, count } = jobIds.length ? await query.in('applied_job_id', jobIds).range(from, to) : await query.range(from, to)
        if (error) return new Response(JSON.stringify({ error: error.message || error }), { status: 500, headers: corsHeaders })
        return new Response(JSON.stringify({ data, count }), { status: 200, headers: corsHeaders })
      }

      const { data, error, count } = await sb.from('candidates').select('*', { count: 'estimated' }).order('created_at', { ascending: false }).range(from, to)
      if (error) return new Response(JSON.stringify({ error: error.message || error }), { status: 500, headers: corsHeaders })
      return new Response(JSON.stringify({ data, count }), { status: 200, headers: corsHeaders })
    }

    // For other methods, parse body if present
    const txt = await req.text()
    let body: any = {}
    if (txt && txt.trim()) {
      try { body = JSON.parse(txt) } catch (parseErr) {
        console.error('Failed to parse JSON body', parseErr)
        return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: corsHeaders })
      }
    }

    // POST - create (bulk or single). If body.upload & body.candidates -> treat as import with upload row
    if (req.method === 'POST') {
      if (isClientUser) return new Response(JSON.stringify({ error: 'Forbidden: clients have read-only access' }), { status: 403, headers: corsHeaders })
      const upload = body.upload || {}
      const candidates = body.candidates || (body.candidate ? [body.candidate] : [])
      // create upload record (optional)
      let up: any = null
      if (upload && upload.file_name) {
        // prefer admin client for writes to avoid RLS blocking; fall back to regular client
        const writer = sbAdmin || sb
        const { data: upData, error: upErr } = await writer.from('uploads').insert([{ file_name: upload.file_name, total_records: upload.total_records, uploaded_by: upload.uploaded_by }]).select().single()
        if (upErr) {
          console.error('uploads insert error', upErr)
          return new Response(JSON.stringify({ error: 'Failed to create upload record', details: upErr.message || upErr }), { status: 500, headers: corsHeaders })
        }
        up = upData
      }

      // If candidate entries include job_ref, job_id or applied_job_id, fetch job title to auto-fill role
      for (const c of candidates) {
        try {
          // Try job_ref first
          if (c.job_ref) {
            const { data: jobData, error: jobErr } = await sb.from('jobs').select('id,title,job_id,job_ref').eq('job_ref', c.job_ref).single()
            if (!jobErr && jobData) {
              c.role = c.role || jobData.title || c.job_role
              c._job_id = jobData.id
            }
          }

          // Then check applied_job_id (frontend may send human-friendly job_id like 'job-6' or the actual uuid)
          if (!c._job_id && c.applied_job_id) {
            let jobData: any = null
            try {
              const r = await sb.from('jobs').select('id,title,job_id,job_ref').eq('job_id', c.applied_job_id).single()
              if (!r.error && r.data) jobData = r.data
            } catch (_e) {}
            if (!jobData) {
              try {
                const r2 = await sb.from('jobs').select('id,title,job_id,job_ref').eq('job_ref', c.applied_job_id).single()
                if (!r2.error && r2.data) jobData = r2.data
              } catch (_e) {}
            }
            if (!jobData) {
              try {
                const r3 = await sb.from('jobs').select('id,title,job_id,job_ref').eq('id', c.applied_job_id).single()
                if (!r3.error && r3.data) jobData = r3.data
              } catch (_e) {}
            }
            if (jobData) {
              c.role = c.role || jobData.title || c.job_role
              c._job_id = jobData.id
            }
          }

          // Fallback: check job_id field (may be friendly id or uuid)
          if (!c._job_id && c.job_id) {
            let jobData: any = null
            try {
              const r = await sb.from('jobs').select('id,title,job_id,job_ref').eq('job_id', c.job_id).single()
              if (!r.error && r.data) jobData = r.data
            } catch (_e) {}
            if (!jobData) {
              try {
                const r2 = await sb.from('jobs').select('id,title,job_id,job_ref').eq('id', c.job_id).single()
                if (!r2.error && r2.data) jobData = r2.data
              } catch (_e) {}
            }
            if (jobData) {
              c.role = c.role || jobData.title || c.job_role
              c._job_id = jobData.id
            }
          }
        } catch (e) {
          console.error('failed to resolve job for candidate', e)
        }
      }

      // Ensure applied_job_id uses resolved UUID when available; avoid inserting friendly ids like 'job-6'
      for (const c of candidates) {
        try {
          if (!c._job_id && c.applied_job_id) {
            console.warn('unresolved applied_job_id before insert', { applied_job_id: c.applied_job_id })
          }
          c.applied_job_id = c._job_id || null
        } catch (e) {
          // ignore
        }
      }

      const allowed = (c: any) => ({
            name: c.name || '',
            role: c.job_role || c.role || '',
            date: (function() {
              const todayIso = new Date().toISOString().slice(0,10)
              const raw = c.date || ''
              if (!raw) return todayIso
              // prefer ISO yyyy-mm-dd if present
              const isoMatch = String(raw).match(/(\d{4}-\d{2}-\d{2})/)
              if (isoMatch) {
                const d = new Date(isoMatch[1])
                if (!isNaN(d.getTime())) {
                  const dIso = d.toISOString().slice(0,10)
                  return dIso < todayIso ? todayIso : dIso
                }
              }
              // fallback: try parsing and normalize
              const parsed = new Date(String(raw))
              if (!isNaN(parsed.getTime())) {
                const pIso = parsed.toISOString().slice(0,10)
                return pIso < todayIso ? todayIso : pIso
              }
              return String(raw)
            })(),
        exp: c.experience ? String(c.experience) : (c.exp || ''),
        cctc: c.current_ctc || c.cctc || '',
        ectc: c.expected_ctc || c.ectc || '',
        email: c.email || '',
        phone: c.phone || '',
        linkedin: c.linkedin || '',
        location: c.current_location || c.location || '',
        np: c.notice_period || c.np || '',
        availability: (function() {
          const todayIso = new Date().toISOString().slice(0,10)
          const raw = c.availability || ''
          if (!raw) return ''
          const m = String(raw).match(/^(\d{4}-\d{2}-\d{2})(?:\s+(.*))?$/)
          if (m) {
            const d = new Date(m[1])
            if (!isNaN(d.getTime())) {
              const dIso = d.toISOString().slice(0,10)
              return (dIso < todayIso ? todayIso : dIso) + (m[2] ? ' ' + m[2] : '')
            }
          }
          // else try to parse a date anywhere in string
          const isoMatch = String(raw).match(/(\d{4}-\d{2}-\d{2})/)
          if (isoMatch) {
            const d = new Date(isoMatch[1])
            if (!isNaN(d.getTime())) {
              const dIso = d.toISOString().slice(0,10)
              return String(raw).replace(isoMatch[1], dIso)
            }
          }
          return String(raw)
        })(),
        intstatus: c.intstatus || '',
        selstatus: normalizeSelectionStatus(c.selstatus),
        remarks: c.remarks || '',
        f2f: (function() {
          const todayIso = new Date().toISOString().slice(0,10)
          const raw = c.f2f || ''
          if (!raw) return ''
          const m = String(raw).match(/^(\d{4}-\d{2}-\d{2})(?:\s+(.*))?$/)
          if (m) {
            const d = new Date(m[1])
            if (!isNaN(d.getTime())) {
              const dIso = d.toISOString().slice(0,10)
              return (dIso < todayIso ? todayIso : dIso) + (m[2] ? ' ' + m[2] : '')
            }
          }
          const isoMatch = String(raw).match(/(\d{4}-\d{2}-\d{2})/)
          if (isoMatch) {
            const d = new Date(isoMatch[1])
            if (!isNaN(d.getTime())) {
              const dIso = d.toISOString().slice(0,10)
              return String(raw).replace(isoMatch[1], dIso)
            }
          }
          return String(raw)
        })(),
        interview_slot: (function() {
          const todayIso = new Date().toISOString().slice(0,10)
          const raw = c.interview_slot || c.interview_slot_raw || ''
          if (!raw) return ''
          const m = String(raw).match(/^(\d{4}-\d{2}-\d{2})(?:\s+(.*))?$/)
          if (m) {
            const d = new Date(m[1])
            if (!isNaN(d.getTime())) {
              const dIso = d.toISOString().slice(0,10)
              return (dIso < todayIso ? todayIso : dIso) + (m[2] ? ' ' + m[2] : '')
            }
          }
          const isoMatch = String(raw).match(/(\d{4}-\d{2}-\d{2})/)
          if (isoMatch) {
            const d = new Date(isoMatch[1])
            if (!isNaN(d.getTime())) {
              const dIso = d.toISOString().slice(0,10)
              return String(raw).replace(isoMatch[1], dIso)
            }
          }
          return String(raw)
        })(),
        confirmed_availability: (c.confirmed_availability || c.confirmed_availability_raw || ''),
        applied_job_id: c._job_id || c.applied_job_id || c.job_id || null,
        applied_job_title: c.applied_job_title || c.job_title || c.job_role || c.role || null
      })

      const candidatesWithUpload = candidates.map((c: any) => ({ ...allowed(c), ...(up ? { upload_id: up.id } : {}) }))
      // Use admin client for candidate inserts when available to avoid RLS failures.
      const writerCandidates = sbAdmin || sb
      const { data: inserted, error: insErr } = await writerCandidates.from('candidates').insert(candidatesWithUpload).select()
      if (insErr) {
        console.error('candidates insert error', insErr)
        if (up) await (sbAdmin || sb).from('uploads').update({ status: 'failed', report: { error: insErr.message } }).eq('id', up.id)
        return new Response(JSON.stringify({ error: 'Failed to insert candidates', details: insErr.message || insErr }), { status: 500, headers: corsHeaders })
      }
      if (up) await (sbAdmin || sb).from('uploads').update({ status: 'succeeded', successful_records: inserted.length, failed_records: candidates.length - inserted.length }).eq('id', up.id)
      console.log('import succeeded', { uploadId: up?.id, insertedCount: inserted.length })
      return new Response(JSON.stringify({ upload: up, inserted }), { status: 200, headers: corsHeaders })
    }

    // PUT/PATCH - update a candidate by id
    if (req.method === 'PUT' || req.method === 'PATCH') {
      if (isClientUser) return new Response(JSON.stringify({ error: 'Forbidden: clients have read-only access' }), { status: 403, headers: corsHeaders })
      const id = body.id || body.candidate?.id
      const updates = body.updates || body.candidate || {}
      if (!id) return new Response(JSON.stringify({ error: 'Missing id for update' }), { status: 400, headers: corsHeaders })
      // normalize selection status
      if (updates.selstatus) updates.selstatus = normalizeSelectionStatus(updates.selstatus)
      // Resolve any friendly job identifiers in update payload to real UUIDs
      try {
        if (updates.applied_job_id || updates.job_id || updates.job_ref) {
          const probe = updates.applied_job_id || updates.job_id || updates.job_ref
          let jobData: any = null
          try {
            const r = await sb.from('jobs').select('id').eq('job_id', probe).single()
            if (!r.error && r.data) jobData = r.data
          } catch (_e) {}
          if (!jobData) {
            try {
              const r2 = await sb.from('jobs').select('id').eq('job_ref', probe).single()
              if (!r2.error && r2.data) jobData = r2.data
            } catch (_e) {}
          }
          if (!jobData) {
            try {
              const r3 = await sb.from('jobs').select('id').eq('id', probe).single()
              if (!r3.error && r3.data) jobData = r3.data
            } catch (_e) {}
          }
          updates.applied_job_id = jobData ? jobData.id : null
        }
      } catch (e) {
        console.error('failed to resolve job in update', e)
        updates.applied_job_id = null
      }

      const { data, error } = await (sbAdmin || sb).from('candidates').update(updates).eq('id', id).select().single()
      if (error) return new Response(JSON.stringify({ error: error.message || error }), { status: 500, headers: corsHeaders })
      return new Response(JSON.stringify({ updated: data }), { status: 200, headers: corsHeaders })
    }

    // DELETE - delete by id (from body or query param)
    if (req.method === 'DELETE') {
      if (isClientUser) return new Response(JSON.stringify({ error: 'Forbidden: clients have read-only access' }), { status: 403, headers: corsHeaders })
      const u = new URL(req.url)
      const id = body.id || u.searchParams.get('id')
      if (!id) return new Response(JSON.stringify({ error: 'Missing id for delete' }), { status: 400, headers: corsHeaders })
      const { error } = await (sbAdmin || sb).from('candidates').delete().eq('id', id)
      if (error) return new Response(JSON.stringify({ error: error.message || error }), { status: 500, headers: corsHeaders })
      return new Response(JSON.stringify({ deleted: true }), { status: 200, headers: corsHeaders })
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: corsHeaders })
  } catch (err: any) {
    console.error('import_candidates error', err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders })
  }
})
