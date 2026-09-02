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
  const raw = String(value || '').trim()
  const s = raw.toLowerCase()
  // If it's already one of the new labels (case-insensitive), return the label as-is
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
  for (const lbl of NEW_LABELS) if (lbl.toLowerCase() === s) return lbl

  if (!s) return 'Pre-screening in-progress'
  if (s === 'progress' || s === 'in-progress' || s.includes('progress') || s.includes('process') || s.includes('pending')) return 'Pre-screening in-progress'
  if (s === 'hold' || s.includes('hold')) return 'On hold'
  if (s === 'selected' || s.includes('select') || s.includes('offer')) return 'Candidate shortlisted'
  if (s === 'rejected' || s.includes('reject')) return 'Rejected'
  if (s === 'dropped' || s.includes('drop')) return 'Dropped Out'
  if (s.includes('no') && s.includes('show')) return 'Dropped Out'
  return 'Pre-screening in-progress'
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
        // attach lookup labels
        try {
          const psRows = (await (sbAdmin || sb).from('profile_sourcing').select('*')).data || []
          const psMapById: Record<string,string> = {}
          psRows.forEach((r: any) => { if (r && r.id) psMapById[r.id] = r.name })
          const consRows = (await (sbAdmin || sb).from('consultants').select('*')).data || []
          const consMapById: Record<string,string> = {}
          consRows.forEach((r: any) => { if (r && r.id) consMapById[r.id] = r.name })
          if (data) {
            data.profile_sourcing_label = data.profile_sourcing || psMapById[data.profile_sourcing_id] || ''
            data.consultant_label = data.consultant || consMapById[data.consultant_id] || ''
          }
        } catch (e) {
          // ignore label attach errors
        }
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

      // fetch candidate rows
      let data: any[] = []
      let count: number | null = null
      if (clientId) {
        const { data: jobsForClient } = await sb.from('jobs').select('id').eq('client_id', clientId)
        const jobIds = (jobsForClient || []).map((j: any) => j.id)
        const query = sb.from('candidates').select('*', { count: 'estimated' }).order('created_at', { ascending: false })
        const res = jobIds.length ? await query.in('applied_job_id', jobIds).range(from, to) : await query.range(from, to)
        data = res.data || []
        count = res.count || null
      } else {
        const res = await sb.from('candidates').select('*', { count: 'estimated' }).order('created_at', { ascending: false }).range(from, to)
        data = res.data || []
        count = res.count || null
      }
      // attach lookup labels for profile_sourcing and consultant
      try {
        const psRows = (await sb.from('profile_sourcing').select('*')).data || []
        const psMapById: Record<string,string> = {}
        psRows.forEach((r: any) => { if (r && r.id) psMapById[r.id] = r.name })
        const consRows = (await sb.from('consultants').select('*')).data || []
        const consMapById: Record<string,string> = {}
        consRows.forEach((r: any) => { if (r && r.id) consMapById[r.id] = r.name })
        data.forEach((r: any) => {
          r.profile_sourcing_label = r.profile_sourcing || psMapById[r.profile_sourcing_id] || ''
          r.consultant_label = r.consultant || consMapById[r.consultant_id] || ''
        })
      } catch (e) {
        // ignore
      }
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

      // After attempting to resolve real jobs, if candidate has a role but no resolved job,
      // create or reuse a temporary placeholder job so candidates can be associated.
      for (const c of candidates) {
        try {
          if (!c._job_id && (c.role || c.job_role)) {
            const roleName = (c.role || c.job_role || '').toString().trim()
            if (roleName) {
              // Use a deterministic job_ref for temporary jobs so repeated imports reuse the same placeholder
              const tempRef = `temp:${roleName.toLowerCase().replace(/[^a-z0-9_-]+/g, '-')}`
              try {
                // check if a job already exists with this tempRef
                const existingByRef: any = await sb.from('jobs').select('id').eq('job_ref', tempRef).limit(1).maybeSingle()
                if (!existingByRef.error && existingByRef.data) {
                  c._job_id = existingByRef.data.id
                } else {
                  // also check for an existing job with the same title (case-insensitive)
                  let existingByTitle: any = null
                  try {
                    existingByTitle = await sb.from('jobs').select('id').ilike('title', roleName).limit(1).maybeSingle()
                  } catch (_e) {
                    existingByTitle = null
                  }
                  if (existingByTitle && !existingByTitle.error && existingByTitle.data) {
                    c._job_id = existingByTitle.data.id
                  } else {
                    // create a minimal placeholder job using admin client to bypass RLS if available
                    const writer = sbAdmin || sb
                    const insertPayload = {
                      title: roleName,
                      job_ref: tempRef,
                      status: 'draft'
                    }
                    try {
                      const { data: newJob, error: newJobErr } = await writer.from('jobs').insert([insertPayload]).select('id').limit(1).maybeSingle()
                      if (!newJobErr && newJob) {
                        c._job_id = newJob.id
                      }
                    } catch (_e) {
                      // ignore creation errors, leave c._job_id null
                    }
                  }
                }
              } catch (e) {
                console.warn('failed to create/resolve temp job for role', roleName, e)
              }
            }
          }
        } catch (e) {
          // ignore
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

      const asDisplay = (raw: any) => {
        if (raw == null) return ''
        // If raw is a JSON string, try to parse
        if (typeof raw === 'string') {
          const s = raw.trim()
          if (!s) return ''
          if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
            try { raw = JSON.parse(s) } catch (e) { return s }
          } else {
            return s
          }
        }
        if (typeof raw === 'object') {
          if (raw.display && typeof raw.display === 'string' && raw.display.trim()) return raw.display
          if (raw.start_time && raw.end_time) {
            const day = raw.day ? `${raw.day}, ` : ''
            const date = raw.date || ''
            return `${day}${date} - ${raw.start_time} to ${raw.end_time}`.trim()
          }
          if (raw.time || raw.start_time) {
            const t = raw.time || raw.start_time
            const day = raw.day ? `${raw.day}, ` : ''
            const date = raw.date || ''
            return `${day}${date} - ${t}`.trim()
          }
          return Object.values(raw).filter(Boolean).join(' ').trim()
        }
        return String(raw).trim()
      }

      const allowed = (c: any) => ({
            name: c.name || '',
            role: c.job_role || c.role || '',
            date: (function() {
              const raw = c.date || ''
              if (!raw) return ''
              // prefer ISO yyyy-mm-dd if present
              const isoMatch = String(raw).match(/(\d{4}-\d{2}-\d{2})/)
              if (isoMatch) {
                // use the matched ISO date string directly to avoid timezone shifts
                const dIso = isoMatch[1]
                return dIso
              }
              // fallback: try parsing and normalize
              const parsed = new Date(String(raw))
              if (!isNaN(parsed.getTime())) {
                const pIso = parsed.toISOString().slice(0,10)
                return pIso
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
          const raw = c.availability || ''
          if (!raw) return ''
          if (typeof raw === 'object') return asDisplay(raw)
          const m = String(raw).match(/^(\d{4}-\d{2}-\d{2})(?:\s+(.*))?$/)
          if (m) {
            const dIso = m[1]
            return (dIso) + (m[2] ? ' ' + m[2] : '')
          }
          // else try to parse a date anywhere in string
          const isoMatch = String(raw).match(/(\d{4}-\d{2}-\d{2})/)
          if (isoMatch) {
            const dIso = isoMatch[1]
            return String(raw).replace(isoMatch[1], dIso)
          }
          return String(raw)
        })(),
        intstatus: c.intstatus || '',
        selstatus: normalizeSelectionStatus(c.selstatus),
        remarks: c.remarks || '',
        f2f: (function() {
          const raw = c.f2f || ''
          if (!raw) return ''
          if (typeof raw === 'object') return asDisplay(raw)
          const m = String(raw).match(/^(\d{4}-\d{2}-\d{2})(?:\s+(.*))?$/)
          if (m) {
            const dIso = m[1]
            return (dIso) + (m[2] ? ' ' + m[2] : '')
          }
          const isoMatch = String(raw).match(/(\d{4}-\d{2}-\d{2})/)
          if (isoMatch) {
            const dIso = isoMatch[1]
            return String(raw).replace(isoMatch[1], dIso)
          }
          return String(raw)
        })(),
        interview_slot: (function() {
          const raw = c.interview_slot || c.interview_slot_raw || ''
          if (!raw) return ''
          if (typeof raw === 'object') return asDisplay(raw)
          const m = String(raw).match(/^(\d{4}-\d{2}-\d{2})(?:\s+(.*))?$/)
          if (m) {
            const dIso = m[1]
            return (dIso) + (m[2] ? ' ' + m[2] : '')
          }
          const isoMatch = String(raw).match(/(\d{4}-\d{2}-\d{2})/)
          if (isoMatch) {
            const dIso = isoMatch[1]
            return String(raw).replace(isoMatch[1], dIso)
          }
          return String(raw)
        })(),
        confirmed_availability: (function() {
          const raw = c.confirmed_availability || c.confirmed_availability_raw || ''
          if (!raw) return ''
          if (typeof raw === 'object') return asDisplay(raw)
          return String(raw).trim()
        })(),
        applied_job_id: c._job_id || c.applied_job_id || c.job_id || null,
        applied_job_title: c.applied_job_title || c.job_title || c.job_role || c.role || null,
        resume_url: c.resume_url || c.resume || null,
        resume_path: c.resume_path || null
        ,
        profile_sourcing: c.profile_sourcing || c.profile_sourcing_name || '',
        consultant: c.consultant || c.consultant_name || ''
      })

      const candidatesWithUpload = candidates.map((c: any) => ({ ...allowed(c), ...(up ? { upload_id: up.id } : {}) }))
      // Load lookup maps for validation/resolution
      const psRows = (await (sbAdmin || sb).from('profile_sourcing').select('*')).data || []
      const psMapByName: Record<string,string> = {}
      const psMapById: Record<string,string> = {}
      psRows.forEach((r: any) => { if (r && r.name) { psMapByName[String(r.name).toLowerCase()] = r.id; psMapById[r.id] = r.name } })
      const consultantsRows = (await (sbAdmin || sb).from('consultants').select('*')).data || []
      const consMapByName: Record<string,string> = {}
      const consMapById: Record<string,string> = {}
      consultantsRows.forEach((r: any) => { if (r && r.name) { consMapByName[String(r.name).toLowerCase()] = r.id; consMapById[r.id] = r.name } })

      // Validate & resolve profile_sourcing and consultant names to IDs before proceeding.
      const rowErrors: any[] = []
      for (let i = 0; i < candidatesWithUpload.length; i++) {
        const c = candidatesWithUpload[i]
        try {
          // resolve profile_sourcing name -> id if provided as name
          if (c.profile_sourcing && !c.profile_sourcing_id) {
            const lookup = psMapByName[String(c.profile_sourcing).trim().toLowerCase()]
            if (!lookup) {
              rowErrors.push({ row: i + 1, error: `Unknown profile_sourcing: ${String(c.profile_sourcing)}` })
              continue
            }
            c.profile_sourcing_id = lookup
          }
          // If profile_sourcing_id provided directly, normalize label if possible
          if (c.profile_sourcing_id && !c.profile_sourcing) {
            c.profile_sourcing = psMapById[c.profile_sourcing_id] || ''
          }

          // If profile_sourcing is Consultant, consultant must be provided and resolved
          const psLabel = String(c.profile_sourcing || '').trim().toLowerCase()
          if (psLabel === 'consultant') {
            if (!c.consultant && !c.consultant_id) {
              rowErrors.push({ row: i + 1, error: 'Consultant is required when Profile Sourcing is Consultant' })
              continue
            }
            if (c.consultant && !c.consultant_id) {
              const lookupC = consMapByName[String(c.consultant).trim().toLowerCase()]
              if (!lookupC) {
                rowErrors.push({ row: i + 1, error: `Unknown consultant: ${String(c.consultant)}` })
                continue
              }
              c.consultant_id = lookupC
            }
            if (c.consultant_id && !c.consultant) c.consultant = consMapById[c.consultant_id] || ''
          } else {
            // if not Consultant sourcing, clear consultant fields
            delete c.consultant
            delete c.consultant_id
          }
        } catch (e) {
          rowErrors.push({ row: i + 1, error: 'Validation error' })
        }
      }
      if (rowErrors.length) {
        if (up) await (sbAdmin || sb).from('uploads').update({ status: 'failed', report: { error: rowErrors } }).eq('id', up.id)
        return new Response(JSON.stringify({ error: 'Validation errors in import rows', rows: rowErrors }), { status: 400, headers: corsHeaders })
      }
      const writerCandidates = sbAdmin || sb

      const toInsert: any[] = []
      const updated: any[] = []

      for (const c of candidatesWithUpload) {
        try {
          const email = (c.email || '').toString().trim()
          const jobId = c.applied_job_id || null
          if (email) {
            // 1) try exact match by email + applied_job_id (existing behaviour)
            const existingRes: any = await writerCandidates.from('candidates').select('*').eq('email', email).eq('applied_job_id', jobId).limit(1).maybeSingle()
            if (!existingRes.error && existingRes.data) {
              const existingId = existingRes.data.id
              // Build clean update payload containing only real DB columns
              const updatePayloadClean: any = {
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
                selstatus: c.selstatus,
                remarks: c.remarks,
                f2f: c.f2f,
                interview_slot: c.interview_slot,
                confirmed_availability: c.confirmed_availability,
                applied_job_id: c.applied_job_id,
                applied_job_title: c.applied_job_title,
                resume_url: c.resume_url,
                resume_path: c.resume_path,
                upload_id: c.upload_id || null,
                profile_sourcing_id: c.profile_sourcing_id || null,
                consultant_id: c.consultant_id || null
              }
              const { data: upData, error: upErr } = await writerCandidates.from('candidates').update(updatePayloadClean).eq('id', existingId).select().single()
              if (upErr) {
                console.error('candidate update error', upErr)
                if (up) await (sbAdmin || sb).from('uploads').update({ status: 'failed', report: { error: upErr.message } }).eq('id', up.id)
                return new Response(JSON.stringify({ error: 'Failed to update existing candidate', details: upErr.message || upErr }), { status: 500, headers: corsHeaders })
              }
              updated.push(upData)
              continue
            }

            // 2) if not found, try matching by email + role (same role) and update that candidate
            try {
              const existingByEmailRole: any = await writerCandidates.from('candidates').select('*').eq('email', email).ilike('role', c.role || '').limit(1).maybeSingle()
              if (!existingByEmailRole.error && existingByEmailRole.data) {
                const existingId = existingByEmailRole.data.id
                const updatePayloadClean: any = {
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
                  selstatus: c.selstatus,
                  remarks: c.remarks,
                  f2f: c.f2f,
                  interview_slot: c.interview_slot,
                  confirmed_availability: c.confirmed_availability,
                  applied_job_id: c.applied_job_id,
                  applied_job_title: c.applied_job_title,
                  resume_url: c.resume_url,
                  resume_path: c.resume_path,
                  upload_id: c.upload_id || null,
                  profile_sourcing_id: c.profile_sourcing_id || null,
                  consultant_id: c.consultant_id || null
                }
                const { data: upData, error: upErr } = await writerCandidates.from('candidates').update(updatePayloadClean).eq('id', existingId).select().single()
                if (upErr) {
                  console.error('candidate update error', upErr)
                  if (up) await (sbAdmin || sb).from('uploads').update({ status: 'failed', report: { error: upErr.message } }).eq('id', up.id)
                  return new Response(JSON.stringify({ error: 'Failed to update existing candidate', details: upErr.message || upErr }), { status: 500, headers: corsHeaders })
                }
                updated.push(upData)
                continue
              }
            } catch (e) {
              // ignore lookup errors and continue to next checks
            }
          }

          // 3) If no email match, or email absent, try matching by name + role (treat same role+name as same candidate)
          try {
            const name = (c.name || '').toString().trim()
            const role = (c.role || '').toString().trim()
            if (name && role) {
              const existingByNameRole: any = await writerCandidates.from('candidates').select('*').ilike('name', name).ilike('role', role).limit(1).maybeSingle()
              if (!existingByNameRole.error && existingByNameRole.data) {
                const existingId = existingByNameRole.data.id
                const updatePayloadClean: any = {
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
                  selstatus: c.selstatus,
                  remarks: c.remarks,
                  f2f: c.f2f,
                  interview_slot: c.interview_slot,
                  confirmed_availability: c.confirmed_availability,
                  applied_job_id: c.applied_job_id,
                  applied_job_title: c.applied_job_title,
                  resume_url: c.resume_url,
                  resume_path: c.resume_path,
                  upload_id: c.upload_id || null,
                  profile_sourcing_id: c.profile_sourcing_id || null,
                  consultant_id: c.consultant_id || null
                }
                const { data: upData, error: upErr } = await writerCandidates.from('candidates').update(updatePayloadClean).eq('id', existingId).select().single()
                if (upErr) {
                  console.error('candidate update error', upErr)
                  if (up) await (sbAdmin || sb).from('uploads').update({ status: 'failed', report: { error: upErr.message } }).eq('id', up.id)
                  return new Response(JSON.stringify({ error: 'Failed to update existing candidate', details: upErr.message || upErr }), { status: 500, headers: corsHeaders })
                }
                updated.push(upData)
                continue
              }
            }
          } catch (e) {
            console.error('failed to check existing candidate by name+role', e)
          }
        } catch (e) {
          console.error('failed to check existing candidate', e)
        }
        toInsert.push(c)
      }

      let inserted: any[] = []
      if (toInsert.length > 0) {
        // Prepare clean insert rows with only DB columns (avoid inserting label text fields)
        const insertRows = toInsert.map((c: any) => ({
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
          selstatus: c.selstatus,
          remarks: c.remarks,
          f2f: c.f2f,
          interview_slot: c.interview_slot,
          confirmed_availability: c.confirmed_availability,
          applied_job_id: c.applied_job_id,
          applied_job_title: c.applied_job_title,
          resume_url: c.resume_url,
          resume_path: c.resume_path,
          upload_id: c.upload_id || null,
          profile_sourcing_id: c.profile_sourcing_id || null,
          consultant_id: c.consultant_id || null
        }))
        const { data: insertedData, error: insErr } = await writerCandidates.from('candidates').insert(insertRows).select()
        if (insErr) {
          console.error('candidates insert error', insErr)
          if (up) await (sbAdmin || sb).from('uploads').update({ status: 'failed', report: { error: insErr.message } }).eq('id', up.id)
          return new Response(JSON.stringify({ error: 'Failed to insert candidates', details: insErr.message || insErr }), { status: 500, headers: corsHeaders })
        }
        inserted = insertedData || []
      }

      // Attach human-readable labels for profile_sourcing and consultant for UI exports
      const totalSucceeded = (inserted.length) + (updated.length)
      const allCandidates = (inserted || []).concat(updated || [])
      allCandidates.forEach((r: any) => {
        r.profile_sourcing_label = r.profile_sourcing || psMapById[r.profile_sourcing_id] || ''
        r.consultant_label = r.consultant || consMapById[r.consultant_id] || ''
      })
      if (up) await (sbAdmin || sb).from('uploads').update({ status: 'succeeded', successful_records: totalSucceeded, failed_records: candidates.length - totalSucceeded }).eq('id', up.id)
      console.log('import succeeded', { uploadId: up?.id, insertedCount: inserted.length, updatedCount: updated.length })
      return new Response(JSON.stringify({ upload: up, inserted, updated }), { status: 200, headers: corsHeaders })
    }

    // PUT/PATCH - update a candidate by id
    if (req.method === 'PUT' || req.method === 'PATCH') {
      const id = body.id || body.candidate?.id
      const updates = body.updates || body.candidate || {}
      // If requester is a client user, allow only updating `client_feedback` and only for candidates belonging to their jobs
      if (isClientUser) {
        // only allow either initial client_feedback set or append via append_client_feedback
        const keys = Object.keys(updates || {})
        if (keys.length !== 1 || (keys[0] !== 'client_feedback' && keys[0] !== 'append_client_feedback')) {
          return new Response(JSON.stringify({ error: 'Forbidden: clients can only set or append client_feedback' }), { status: 403, headers: corsHeaders })
        }
        if (!requestClientId) return new Response(JSON.stringify({ error: 'Forbidden: client identity not resolved' }), { status: 403, headers: corsHeaders })
        // fetch candidate to check applied_job_id and existing feedback
        const candRes = await sb.from('candidates').select('applied_job_id, client_feedback').eq('id', id).single()
        if (candRes.error) return new Response(JSON.stringify({ error: candRes.error.message || candRes.error }), { status: 500, headers: corsHeaders })
        const appliedJobId = candRes.data?.applied_job_id || null
        const existingFeedback = candRes.data?.client_feedback || ''
        if (appliedJobId) {
          const { data: jobsForClient, error: jobsErr } = await sb.from('jobs').select('id').eq('client_id', requestClientId)
          if (jobsErr) return new Response(JSON.stringify({ error: jobsErr.message || jobsErr }), { status: 500, headers: corsHeaders })
          const jobIds = (jobsForClient || []).map((j: any) => j.id)
          if (!jobIds.includes(appliedJobId)) return new Response(JSON.stringify({ error: 'Forbidden: candidate does not belong to your client' }), { status: 403, headers: corsHeaders })
        } else {
          // candidate not assigned to a job - deny
          return new Response(JSON.stringify({ error: 'Forbidden: candidate not assignable by client' }), { status: 403, headers: corsHeaders })
        }

        if (keys[0] === 'client_feedback') {
          // initial set only when no existing feedback
          if (existingFeedback && String(existingFeedback).trim() !== '') {
            return new Response(JSON.stringify({ error: 'Forbidden: initial client feedback already submitted' }), { status: 403, headers: corsHeaders })
          }
          const { data, error } = await (sbAdmin || sb).from('candidates').update({ client_feedback: updates.client_feedback }).eq('id', id).select().single()
          if (error) return new Response(JSON.stringify({ error: error.message || error }), { status: 500, headers: corsHeaders })
          return new Response(JSON.stringify({ updated: data }), { status: 200, headers: corsHeaders })
        }

        // append flow
        if (keys[0] === 'append_client_feedback') {
          const newText = String(updates.append_client_feedback || '').trim()
          if (!newText) return new Response(JSON.stringify({ error: 'Missing feedback to append' }), { status: 400, headers: corsHeaders })
          const ts = new Date().toISOString().slice(0, 19).replace('T', ' ')
          const appended = existingFeedback ? `${existingFeedback}\n[${ts}] ${newText}` : `[${ts}] ${newText}`
          const { data, error } = await (sbAdmin || sb).from('candidates').update({ client_feedback: appended }).eq('id', id).select().single()
          if (error) return new Response(JSON.stringify({ error: error.message || error }), { status: 500, headers: corsHeaders })
          return new Response(JSON.stringify({ updated: data }), { status: 200, headers: corsHeaders })
        }
      }

      // non-client users continue with regular update path
      
      
      
      
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

      // Resolve profile_sourcing and consultant in update payload
      try {
        const psRows = (await (sbAdmin || sb).from('profile_sourcing').select('*')).data || []
        const psMapByName: Record<string,string> = {}
        const psMapById: Record<string,string> = {}
        psRows.forEach((r: any) => { if (r && r.id) { psMapById[r.id] = r.name; psMapByName[String(r.name).toLowerCase()] = r.id } })
        const consRows = (await (sbAdmin || sb).from('consultants').select('*')).data || []
        const consMapByName: Record<string,string> = {}
        const consMapById: Record<string,string> = {}
        consRows.forEach((r: any) => { if (r && r.id) { consMapById[r.id] = r.name; consMapByName[String(r.name).toLowerCase()] = r.id } })

        if (updates.profile_sourcing && !updates.profile_sourcing_id) {
          const probe = String(updates.profile_sourcing).trim().toLowerCase()
          const id = psMapByName[probe]
          if (id) updates.profile_sourcing_id = id
        }
        if (updates.profile_sourcing_id && !updates.profile_sourcing) updates.profile_sourcing = psMapById[updates.profile_sourcing_id] || ''

        const psLabel = String(updates.profile_sourcing || '').trim().toLowerCase()
        if (psLabel === 'consultant') {
          if (!updates.consultant && !updates.consultant_id) {
            return new Response(JSON.stringify({ error: 'Consultant is required when Profile Sourcing is Consultant' }), { status: 400, headers: corsHeaders })
          }
          if (updates.consultant && !updates.consultant_id) {
            const cid = consMapByName[String(updates.consultant).trim().toLowerCase()]
            if (!cid) return new Response(JSON.stringify({ error: `Unknown consultant: ${updates.consultant}` }), { status: 400, headers: corsHeaders })
            updates.consultant_id = cid
          }
        } else {
          // clear consultant if profile sourcing not consultant
          updates.consultant = null
          updates.consultant_id = null
        }
      } catch (e) {
        console.warn('failed to resolve profile_sourcing/consultant in update', e)
      }

      // Build clean updates object containing only DB columns; ignore label fields like `consultant` or `profile_sourcing` strings
      const updatesClean: any = {}
      const allowedFields = ['name','role','date','exp','cctc','ectc','email','phone','linkedin','location','np','availability','intstatus','selstatus','remarks','f2f','interview_slot','confirmed_availability','applied_job_id','applied_job_title','resume_url','resume_path','upload_id','profile_sourcing_id','consultant_id','client_feedback']
      for (const k of allowedFields) {
        if (Object.prototype.hasOwnProperty.call(updates, k)) updatesClean[k] = updates[k]
      }
      const { data, error } = await (sbAdmin || sb).from('candidates').update(updatesClean).eq('id', id).select().single()
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
