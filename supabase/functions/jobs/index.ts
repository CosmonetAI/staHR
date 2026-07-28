// jobs edge function - basic CRUD for jobs

import { serve } from 'https://deno.land/std@0.203.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || 'https://jovcgovzutszlmmsvynz.supabase.co'
const SUPABASE_SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpvdmNnb3Z6dXRzemxtbXN2eW56Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2NjE2NDAsImV4cCI6MjEwMDIzNzY0MH0.GmzMC3SvmPzSgXP133_6_5EqVonPoFws6f6zBvnCz2Y'

let sb: any = null

function getClient() {
  if (sb) return sb
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) return null
  sb = createClient(String(SUPABASE_URL), String(SUPABASE_SERVICE_ROLE))
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
    return new Response(JSON.stringify({ error: 'Server misconfiguration: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE' }), { status: 500, headers: corsHeaders })
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
        if (jobId && !sub) {
          const { data, error } = await sb.from('jobs').select('*').eq('id', jobId).single()
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
        const { data, error, count } = await sb.from('jobs').select('*', { count: 'estimated' }).order('created_at', { ascending: false }).range(from, to)
        if (error) return json({ error: error.message || error }, 500)
        return json({ data, count })
      }

      if (req.method === 'POST') {
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
          status: j.status || 'Open',
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
          status: updates.status,
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
        const { data, error } = await sb.from('applications').select('*, candidates(*)').eq('id', appId).single()
        if (error) return json({ error: error.message || error }, 500)
        return json(data)
      }

      if (req.method === 'PATCH' || req.method === 'PUT') {
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
