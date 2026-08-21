// jobs edge function - basic CRUD for jobs

import { serve } from 'https://deno.land/std@0.203.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js'

const SUPABASE_URL = Deno.env.get('PROJECT_SUPABASE_URL') || Deno.env.get('SUPABASE_URL') || Deno.env.get('VITE_SUPABASE_URL')
const SUPABASE_ANON_KEY = Deno.env.get('PROJECT_SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('VITE_SUPABASE_ANON_KEY')

let sb: any = null

function getClient() {
  if (sb) return sb
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null
  sb = createClient(String(SUPABASE_URL), String(SUPABASE_ANON_KEY))
  return sb
}

serve(async (req) => {
  const origin = req.headers.get('origin') || '*'
  const corsHeaders = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-api-key, x-apikey, x-client-info',
    'Access-Control-Allow-Credentials': 'true'
  }

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })

  // ensure supabase client available at runtime
  const client = getClient()
  if (!client) {
    return new Response(JSON.stringify({ error: 'Server misconfiguration: missing SUPABASE_URL or SUPABASE_ANON_KEY' }), { status: 500, headers: corsHeaders })
  }

  // use `client` as the supabase client in handlers
  const sb = client

  try {
    const url = new URL(req.url)
    const pathname = url.pathname || ''
    const parts = pathname.split('/').filter(Boolean)

    const txt = await req.text()
    let body: any = {}
    if (txt && txt.trim()) {
      try { body = JSON.parse(txt) } catch (err) { return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: corsHeaders }) }
    }

    // Helper: respond JSON
    const json = (data: any, status = 200) => new Response(JSON.stringify(data), { status, headers: corsHeaders })

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
          // ignore token parse errors
        }
      }
    } catch (e) {
      console.warn('failed to detect client user', e)
    }

    // Routes:
    // GET /jobs -> list jobs
    // GET /jobs/:id -> single job
    // POST /jobs -> create job
    // PATCH/PUT /jobs/:id -> update job
    // DELETE /jobs/:id -> delete job
    // POST /jobs/:id/apply -> create application for job
    // GET /jobs/:id/applications -> list applications for job
    // GET /applications/:id -> get application
    // PATCH /applications/:id -> update application (status, notes). Updates candidate selstatus on selection/rejection.

    // helper to resolve job_ref like 'job-1' to uuid
    async function resolveJobId(maybeRef: string | null) {
      if (!maybeRef) return null
      // if it's not a human-friendly id (job-1), assume it's already a UUID and return
      if (!maybeRef.startsWith('job-')) return maybeRef
      try {
        // try to find by job_id column first
        try {
          const r = await sb.from('jobs').select('id').eq('job_id', maybeRef).limit(1).maybeSingle()
          if (r && r.data && r.data.id) return r.data.id
        } catch (_) {
          // ignore
        }
        // fallback to job_ref for older rows
        const r2 = await sb.from('jobs').select('id').eq('job_ref', maybeRef).limit(1).maybeSingle()
        if (r2 && r2.data && r2.data.id) return r2.data.id
      } catch (e) {
        // ignore and return null
      }
      return null
    }

    // route: /jobs
    if (parts[0] === 'jobs') {
      let jobId = parts[1] || null
      const sub = parts[2] || null
      // resolve job_ref to uuid if needed
      if (jobId && jobId.startsWith('job-')) {
        const resolved = await resolveJobId(jobId)
        if (resolved) jobId = resolved
      }

      if (req.method === 'GET') {
        // attempt to detect client user from Authorization header and map to client id
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
        } catch (e) { console.warn('failed to resolve clientId for request', e) }

        if (jobId && !sub) {
          const q = sb.from('jobs').select('*').eq('id', jobId)
          const { data, error } = await q.single()
          if (error) return json({ error: error.message || error }, 500)
          return json(data)
        }

        if (jobId && sub === 'applications') {
          const { data, error } = await sb.from('applications').select('*, candidates(*)').eq('job_id', jobId).order('applied_at', { ascending: false })
          if (error) return json({ error: error.message || error }, 500)
          return json(data)
        }

        // list jobs with paging
        const page = Number(url.searchParams.get('page') || '1')
        const perPage = Number(url.searchParams.get('perPage') || '50')
        const from = (page - 1) * perPage
        const to = from + perPage - 1
        let query = sb.from('jobs').select('*', { count: 'estimated' }).order('created_at', { ascending: false })
        if (clientId) query = query.eq('client_id', clientId)
        const { data, error, count } = await query.range(from, to)
        if (error) return json({ error: error.message || error }, 500)
        return json({ data, count })
      }

      if (req.method === 'POST') {
        // clients are read-only: prevent create actions
        if (isClientUser) return json({ error: 'Forbidden: clients have read-only access' }, 403)
        if (jobId && sub === 'apply') {
          // apply to jobId
          const application = body.application || body
          if (!application || !application.candidate_id) return json({ error: 'Missing candidate_id' }, 400)
          const row = {
            job_id: jobId,
            candidate_id: application.candidate_id,
            status: application.status || 'applied',
            stage: application.stage || null,
            notes: application.notes || null
          }
          const { data, error } = await sb.from('applications').insert([row]).select()
          if (error) return json({ error: error.message || error }, 500)
          return json(data && data[0] ? data[0] : data)
        }

        // create job
        const j = body.job || body
        if (!j || !j.title) return json({ error: 'Missing job title' }, 400)
        const parseSkills = (v: any) => {
          if (!v) return []
          if (Array.isArray(v)) return v
          if (typeof v === 'string') return v.split(',').map((s: string) => s.trim()).filter(Boolean)
          return []
        }

        const row = {
          title: j.title,
          openings: j.openings || 1,
          location: j.location || null,
          client_id: j.client_id || null,
          posted: j.posted || null,
          status: j.status ? String(j.status).toLowerCase() : 'open',
          description: j.desc || j.description || null,
          department: j.department || null,
          employment_type: j.employment_type || null,
          experience_min: j.experience_min || null,
          experience_max: j.experience_max || null,
          work_mode: j.work_mode || j.work_mode || null,
          summary: j.summary || j.desc || j.description || null,
          responsibilities: j.responsibilities || null,
          technical_skills: parseSkills(j.technical_skills || j.technicalSkills || j.skills),
          qualifications: j.qualifications || null,
          preferred_skills: j.preferred_skills || j.preferredSkills || null,
          nice_to_have: j.nice_to_have || j.niceToHave || null
        }
        const { data, error } = await sb.from('jobs').insert([row]).select()
        if (error) return json({ error: error.message || error }, 500)
        return json(data && data[0] ? data[0] : data)
      }

      if (req.method === 'PATCH' || req.method === 'PUT') {
        if (isClientUser) return json({ error: 'Forbidden: clients have read-only access' }, 403)
        if (!jobId) return json({ error: 'Missing job id' }, 400)
        const updates = body.job || body
        const parseSkills = (v: any) => {
          if (!v) return undefined
          if (Array.isArray(v)) return v
          if (typeof v === 'string') return v.split(',').map((s: string) => s.trim()).filter(Boolean)
          return undefined
        }

        const allowed = {
          title: updates.title,
          client_id: updates.client_id,
          openings: updates.openings,
          location: updates.location,
          posted: updates.posted,
          status: updates.status ? String(updates.status).toLowerCase() : undefined,
          description: updates.desc || updates.description,
          department: updates.department,
          employment_type: updates.employment_type,
          experience_min: updates.experience_min,
          experience_max: updates.experience_max,
          work_mode: updates.work_mode,
          summary: updates.summary,
          responsibilities: updates.responsibilities,
          technical_skills: parseSkills(updates.technical_skills || updates.technicalSkills || updates.skills),
          qualifications: updates.qualifications,
          preferred_skills: updates.preferred_skills,
          nice_to_have: updates.nice_to_have
        }
        const { data, error } = await sb.from('jobs').update(allowed).eq('id', jobId).select().single()
        if (error) return json({ error: error.message || error }, 500)
        return json(data)
      }

      if (req.method === 'DELETE') {
        if (isClientUser) return json({ error: 'Forbidden: clients have read-only access' }, 403)
        if (!jobId) return json({ error: 'Missing job id' }, 400)
        const { error } = await sb.from('jobs').delete().eq('id', jobId)
        if (error) return json({ error: error.message || error }, 500)
        return json({ deleted: true })
      }
    }

    // route: /applications
    if (parts[0] === 'applications') {
      const appId = parts[1] || null

      if (req.method === 'GET') {
        if (!appId) return json({ error: 'Missing application id' }, 400)
        const { data, error } = await sb.from('applications').select('*').eq('id', appId).single()
        if (error) return json({ error: error.message || error }, 500)
        // if client user, ensure application belongs to one of their jobs
        if (isClientUser) {
          const job = await sb.from('jobs').select('client_id').eq('id', data.job_id).single()
          if (job.error) return json({ error: job.error.message || job.error }, 500)
          if (!job.data || job.data.client_id !== requestClientId) return json({ error: 'Forbidden' }, 403)
        }
        // include candidate details
        const { data: appWithCandidate, error: appErr } = await sb.from('applications').select('*, candidates(*)').eq('id', appId).single()
        if (appErr) return json({ error: appErr.message || appErr }, 500)
        return json(appWithCandidate)
      }

      if (req.method === 'PATCH' || req.method === 'PUT') {
        if (isClientUser) return json({ error: 'Forbidden: clients have read-only access' }, 403)
        if (!appId) return json({ error: 'Missing application id' }, 400)
        const updates = body.application || body
        const allowed = {
          status: updates.status,
          stage: updates.stage,
          notes: updates.notes
        }
        const { data, error } = await sb.from('applications').update(allowed).eq('id', appId).select().single()
        if (error) return json({ error: error.message || error }, 500)

        // If status is selected or rejected, update candidate selection status accordingly
        try {
          if (data && data.candidate_id && (data.status === 'selected' || data.status === 'rejected')) {
            const selstatus = data.status === 'selected' ? 'selected' : 'rejected'
            await sb.from('candidates').update({ selstatus }).eq('id', data.candidate_id)
            // if selected, decrement job openings (best-effort)
            if (data.status === 'selected' && data.job_id) {
              const job = await sb.from('jobs').select('openings').eq('id', data.job_id).single()
              if (!job.error && job.data && typeof job.data.openings === 'number' && job.data.openings > 0) {
                await sb.from('jobs').update({ openings: job.data.openings - 1 }).eq('id', data.job_id)
              }
            }
          }
        } catch (e) {
          console.error('post-status update side-effects failed', e)
        }

        return json(data)
      }

      if (req.method === 'DELETE') {
        if (isClientUser) return json({ error: 'Forbidden: clients have read-only access' }, 403)
        if (!appId) return json({ error: 'Missing application id' }, 400)
        const { error } = await sb.from('applications').delete().eq('id', appId)
        if (error) return json({ error: error.message || error }, 500)
        return json({ deleted: true })
      }
    }

    return json({ error: 'Not found' }, 404)
  } catch (err: any) {
    console.error('jobs function error', err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})
