// clients edge function - basic CRUD for clients

import { serve } from 'https://deno.land/std@0.203.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || 'https://jovcgovzutszlmmsvynz.supabase.co'
const SUPABASE_SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpvdmNnb3Z6dXRzemxtbXN2eW56Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDY2MTY0MCwiZXhwIjoyMTAwMjM3NjQwfQ.6IqbA0zzeuCQjcf3Z_IhLjlOdnTABIgoNkhJY3ir4ys'

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE environment variables')
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE must be set')
}

const sb = createClient(String(SUPABASE_URL), String(SUPABASE_SERVICE_ROLE))

serve(async (req) => {
  const origin = req.headers.get('origin') || '*'
  const corsHeaders = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-api-key, x-apikey, x-client-info',
    'Access-Control-Allow-Credentials': 'true'
  }

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })

  try {
    const url = new URL(req.url)
    const parts = url.pathname.split('/').filter(Boolean)
    const id = parts[1] || null

    const json = (data: any, status = 200) => new Response(JSON.stringify(data), { status, headers: corsHeaders })

    if (parts[0] !== 'clients') return json({ error: 'Not found' }, 404)

    if (req.method === 'GET') {
      if (id) {
        const { data, error } = await sb.from('clients').select('*').eq('id', id).single()
        if (error) return json({ error: error.message || error }, 500)
        return json(data)
      }
      const page = Number(url.searchParams.get('page') || '1')
      const perPage = Number(url.searchParams.get('perPage') || '50')
      const from = (page - 1) * perPage
      const to = from + perPage - 1
      const { data, error, count } = await sb.from('clients').select('*', { count: 'estimated' }).order('created_at', { ascending: false }).range(from, to)
      if (error) return json({ error: error.message || error }, 500)
      return json({ data, count })
    }

    const txt = await req.text()
    let body: any = {}
    if (txt && txt.trim()) {
      try { body = JSON.parse(txt) } catch (err) { return json({ error: 'Invalid JSON body' }, 400) }
    }

    if (req.method === 'POST') {
      const c = body.client || body
      if (!c || !c.name) return json({ error: 'Missing client name' }, 400)
      const row = {
        name: c.name,
        contact_name: c.contact_name || null,
        email: c.email || null,
        phone: c.phone || null,
        notes: c.notes || null
      }
      const { data, error } = await sb.from('clients').insert([row]).select()
      if (error) return json({ error: error.message || error }, 500)
      return json(data && data[0] ? data[0] : data)
    }

    if (req.method === 'PATCH' || req.method === 'PUT') {
      if (!id) return json({ error: 'Missing client id' }, 400)
      const updates = body.client || body
      const allowed = {
        name: updates.name,
        contact_name: updates.contact_name,
        email: updates.email,
        phone: updates.phone,
        notes: updates.notes
      }
      const { data, error } = await sb.from('clients').update(allowed).eq('id', id).select().single()
      if (error) return json({ error: error.message || error }, 500)
      return json(data)
    }

    if (req.method === 'DELETE') {
      if (!id) return json({ error: 'Missing client id' }, 400)
      const { error } = await sb.from('clients').delete().eq('id', id)
      if (error) return json({ error: error.message || error }, 500)
      return json({ deleted: true })
    }

    return json({ error: 'Method not allowed' }, 405)
  } catch (e) {
    console.error('clients function error', e)
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})
