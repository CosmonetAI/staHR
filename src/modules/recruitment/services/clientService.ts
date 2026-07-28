import { supabase } from '../../../supabase/supabaseClient'

const EDGE_FUNCTIONS_URL = String(import.meta.env.VITE_EDGE_FUNCTIONS_URL || import.meta.env.VITE_FUNCTIONS_BASE || '/functions/v1')

async function postEdge(path: string, body: any = null, method = 'POST') {
  if (!EDGE_FUNCTIONS_URL) throw new Error('VITE_EDGE_FUNCTIONS_URL / VITE_FUNCTIONS_BASE is not configured')
  const url = EDGE_FUNCTIONS_URL + path
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const anon = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '')
  if (anon) {
    headers.apikey = anon
    headers['x-api-key'] = anon
    headers['x-apikey'] = anon
    headers['x-client-info'] = 'staHR-client'
  }
  try {
    const sess = await supabase.auth.getSession()
    const token = sess?.data?.session?.access_token
    if (token) headers.Authorization = `Bearer ${token}`
    else if (anon) headers.Authorization = `Bearer ${anon}`
  } catch (_e) {}

  const res = await fetch(url, {
    method,
    mode: 'cors',
    headers,
    body: method === 'GET' || method === 'HEAD' ? undefined : JSON.stringify(body)
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Edge call failed (${res.status}): ${txt}`)
  }
  return res.json()
}

const ClientService = {
  async list() {
    try {
      const res = await postEdge('/clients', null, 'GET')
      if (!res) return []
      if (Array.isArray(res)) return res
      if (Array.isArray(res.data)) return res.data
      return res.data || []
    } catch (e: any) {
      console.error('ClientService.list error', e)
      return []
    }
  },

  async get(id: string) {
    if (!id) return null
    try {
      return await postEdge(`/clients/${id}`, null, 'GET')
    } catch (_e) {
      return null
    }
  },

  async create(client: Partial<any>) {
    try {
      return await postEdge('/clients', client, 'POST')
    } catch (e: any) {
      throw new Error('Failed to create client: ' + (e?.message || String(e)))
    }
  },

  async update(id: string, patch: Partial<any>) {
    try {
      return await postEdge(`/clients/${id}`, patch, 'PATCH')
    } catch (e: any) {
      throw new Error('Failed to update client: ' + (e?.message || String(e)))
    }
  },

  async remove(id: string) {
    try {
      const res = await postEdge(`/clients/${id}`, null, 'DELETE')
      return Boolean(res && (res.deleted || res.success || res.ok))
    } catch (e: any) {
      throw new Error('Failed to delete client: ' + (e?.message || String(e)))
    }
  }
}

export default ClientService
