import { supabase } from '../../../supabase/supabaseClient'
import { Job } from '../../../types'

const EDGE_JOBS_URL = String(import.meta.env.VITE_EDGE_FUNCTIONS_URL || import.meta.env.VITE_EDGE_IMPORT_URL || '')

async function postEdge(path: string, body: any, method = 'POST') {
  if (!EDGE_JOBS_URL) throw new Error('VITE_EDGE_IMPORT_URL is not configured')
  const url = EDGE_JOBS_URL + path
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const anon = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '')
  if (anon) {
    headers['apikey'] = anon
    headers['x-api-key'] = anon
    headers['x-apikey'] = anon
    headers['x-client-info'] = 'staHR-client'
  }
  try {
    const sess = await supabase.auth.getSession()
    const token = sess?.data?.session?.access_token
    if (token) headers['Authorization'] = `Bearer ${token}`
    else if (anon) headers['Authorization'] = `Bearer ${anon}`
  } catch (e) {
    // ignore
  }

  const res = await fetch(url, { method, headers, body: method === 'GET' || method === 'HEAD' ? undefined : JSON.stringify(body), mode: 'cors' })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Edge call failed (${res.status}): ${txt}`)
  }
  return res.json()
}

export const JobService = {
  async list() {
    try {
      const res = await postEdge('/jobs', null, 'GET')
      if (!res) return []
      if (Array.isArray(res)) return res
      if (Array.isArray(res.data)) return res.data
      return []
    } catch (e: any) {
      console.error('JobService.list error', e)
      return []
    }
  },
  async get(id: string) {
    if (!id) return null
    try {
      return await postEdge(`/jobs/${id}`, null, 'GET')
    } catch (e) {
      return null
    }
  },
  async create(job: Partial<Job>) {
    try {
      return await postEdge('/jobs', job, 'POST')
    } catch (e: any) {
      throw new Error('Failed to create job: ' + (e?.message || String(e)))
    }
  },
  async update(id: string, patch: Partial<Job>) {
    try {
      return await postEdge(`/jobs/${id}`, patch, 'PATCH')
    } catch (e: any) {
      throw new Error('Failed to update job: ' + (e?.message || String(e)))
    }
  },
  async remove(id: string) {
    try {
      const res = await postEdge(`/jobs/${id}`, null, 'DELETE')
      return res && (res.deleted || res.success || res.ok) ? true : true
    } catch (e: any) {
      throw new Error('Failed to delete job: ' + (e?.message || String(e)))
    }
  }
}

export default JobService
