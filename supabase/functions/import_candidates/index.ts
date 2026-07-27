// import_candidates edge function
// Expects a JSON body: { upload: {file_name, total_records, uploaded_by}, candidates: [...] }

import { serve } from 'https://deno.land/std@0.203.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || 'https://jovcgovzutszlmmsvynz.supabase.co'
const SUPABASE_SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpvdmNnb3Z6dXRzemxtbXN2eW56Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDY2MTY0MCwiZXhwIjoyMTAwMjM3NjQwfQ.6IqbA0zzeuCQjcf3Z_IhLjlOdnTABIgoNkhJY3ir4ys'

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE environment variables')
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE must be set')
}

const sb = createClient(String(SUPABASE_URL), String(SUPABASE_SERVICE_ROLE))

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

    try {
    // Debug: log presence of auth headers (do not log the secret values)
    const hasApiKey = Boolean(req.headers.get('apikey') || req.headers.get('x-api-key') || req.headers.get('x-apikey'))
    const hasAuth = Boolean(req.headers.get('authorization'))
    console.log('auth header presence', { hasApiKey, hasAuth })

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
      const upload = body.upload || {}
      const candidates = body.candidates || (body.candidate ? [body.candidate] : [])
      // create upload record (optional)
      let up: any = null
      if (upload && upload.file_name) {
        const { data: upData, error: upErr } = await sb.from('uploads').insert([{ file_name: upload.file_name, total_records: upload.total_records, uploaded_by: upload.uploaded_by }]).select().single()
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
        applied_job_id: c._job_id || c.applied_job_id || c.job_id || null,
        applied_job_title: c.applied_job_title || c.job_title || c.job_role || c.role || null
      })

      const candidatesWithUpload = candidates.map((c: any) => ({ ...allowed(c), ...(up ? { upload_id: up.id } : {}) }))
      const { data: inserted, error: insErr } = await sb.from('candidates').insert(candidatesWithUpload).select()
      if (insErr) {
        console.error('candidates insert error', insErr)
        if (up) await sb.from('uploads').update({ status: 'failed', report: { error: insErr.message } }).eq('id', up.id)
        return new Response(JSON.stringify({ error: 'Failed to insert candidates', details: insErr.message || insErr }), { status: 500, headers: corsHeaders })
      }

      if (up) await sb.from('uploads').update({ status: 'succeeded', successful_records: inserted.length, failed_records: candidates.length - inserted.length }).eq('id', up.id)
      console.log('import succeeded', { uploadId: up?.id, insertedCount: inserted.length })
      return new Response(JSON.stringify({ upload: up, inserted }), { status: 200, headers: corsHeaders })
    }

    // PUT/PATCH - update a candidate by id
    if (req.method === 'PUT' || req.method === 'PATCH') {
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

      const { data, error } = await sb.from('candidates').update(updates).eq('id', id).select().single()
      if (error) return new Response(JSON.stringify({ error: error.message || error }), { status: 500, headers: corsHeaders })
      return new Response(JSON.stringify({ updated: data }), { status: 200, headers: corsHeaders })
    }

    // DELETE - delete by id (from body or query param)
    if (req.method === 'DELETE') {
      const u = new URL(req.url)
      const id = body.id || u.searchParams.get('id')
      if (!id) return new Response(JSON.stringify({ error: 'Missing id for delete' }), { status: 400, headers: corsHeaders })
      const { error } = await sb.from('candidates').delete().eq('id', id)
      if (error) return new Response(JSON.stringify({ error: error.message || error }), { status: 500, headers: corsHeaders })
      return new Response(JSON.stringify({ deleted: true }), { status: 200, headers: corsHeaders })
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: corsHeaders })
  } catch (err: any) {
    console.error('import_candidates error', err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders })
  }
})
