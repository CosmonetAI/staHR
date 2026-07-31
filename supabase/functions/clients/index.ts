// clients edge function - basic CRUD for clients

import { serve } from 'https://deno.land/std@0.203.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js'

// Prefer CLI-friendly secret names; fall back to existing keys if present
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

serve(async (req) => {
  const origin = req.headers.get('origin') || '*'
  const corsHeaders = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-api-key, x-apikey, x-client-info',
    'Access-Control-Allow-Credentials': 'true'
  }

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })

  if (!sb) return new Response(JSON.stringify({ error: 'Server misconfiguration: missing SUPABASE_URL or SUPABASE_ANON_KEY' }), { status: 500, headers: corsHeaders })

  try {
    const url = new URL(req.url)
    const parts = url.pathname.split('/').filter(Boolean)
    const id = parts[1] || null

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
          // ignore
        }
      }
    } catch (e) {
      console.warn('failed to detect client user', e)
    }

    if (parts[0] !== 'clients') return json({ error: 'Not found' }, 404)

    if (req.method === 'GET') {
      // support querying by email for client detection
      const qEmail = url.searchParams.get('email')
      if (qEmail) {
        try {
          const { data: clientData, error: clientErr } = await sb.from('clients').select('*').eq('email', qEmail).limit(1).maybeSingle()
          if (clientErr) return json({ error: clientErr.message || clientErr }, 500)
          return json({ data: clientData ? [clientData] : [] })
        } catch (e) {
          return json({ error: String(e) }, 500)
        }
      }
      if (isClientUser) {
        // client users can only view their own client record
        if (id) {
          if (id !== requestClientId) return json({ error: 'Forbidden' }, 403)
          const { data, error } = await sb.from('clients').select('*').eq('id', id).single()
          if (error) return json({ error: error.message || error }, 500)
          return json(data)
        }
        // return only the requesting client's record
        const { data: clientData, error: clientErr } = await sb.from('clients').select('*').eq('id', requestClientId).limit(1).maybeSingle()
        if (clientErr) return json({ error: clientErr.message || clientErr }, 500)
        return json({ data: clientData ? [clientData] : [] })
      }

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
      if (isClientUser) return json({ error: 'Forbidden: clients cannot create client records' }, 403)
      const c = body.client || body
      if (!c || !c.name) return json({ error: 'Missing client name' }, 400)
      if (!c.email || !String(c.email).trim()) return json({ error: 'Client email is required for onboarding' }, 400)

      // when onboarding a client, create an auth user for them and send a password reset link
      let createdUser: any = null
      try {
          // create user via admin API with client role in user_metadata
          const adminClientForAuth = sbAdmin || sb
          if (!adminClientForAuth || !adminClientForAuth.auth || !adminClientForAuth.auth.admin) {
            console.error('Missing admin client for creating user; set PROJECT_SUPABASE_SERVICE_ROLE')
            return json({ error: 'Server misconfiguration: missing service role for creating user' }, 500)
          }
          const createResp: any = await adminClientForAuth.auth.admin.createUser({ email: c.email, email_confirm: false, user_metadata: { role: 'client', client_name: c.name } } as any)
          if (createResp?.error) {
            console.error('admin.createUser error', createResp.error)
            return json({ error: createResp.error?.message || createResp.error }, 500)
          }
          createdUser = createResp?.data?.user || createResp?.user || null
      } catch (e) {
        console.error('Failed to create auth user', e)
        return json({ error: 'Failed to create auth user: ' + String(e) }, 500)
      }

      const row = {
        name: c.name,
        contact_name: c.contact_name || null,
        email: c.email || null,
        phone: c.phone || null,
        notes: c.notes || null,
        user_id: createdUser?.id || null
      }

      const writer = sbAdmin || sb
      const { data, error } = await writer.from('clients').insert([row]).select()
      if (error) {
        console.error('clients insert error', error)
        return json({ error: error.message || error }, 500)
      }

      // send password reset / invite email via centralized email function
      try {
        const functionsBase = Deno.env.get('FUNCTIONS_BASE') || (SUPABASE_URL ? `${SUPABASE_URL}/functions/v1` : undefined)
        const appUrl = Deno.env.get('APP_URL') || Deno.env.get('SITE_URL') || undefined
        const redirectTo = appUrl ? `${appUrl}/reset` : undefined
        const resp = await fetch(`${functionsBase.replace(/\/$/, '')}/email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'apikey': SUPABASE_ANON_KEY
          },
          body: JSON.stringify({ type: 'invite', email: c.email, redirectTo })
        })
        if (!resp.ok) {
          const txt = await resp.text().catch(() => '')
          console.warn('Email function returned non-ok', resp.status, txt)
        }
      } catch (e) {
        console.warn('Failed to send invite email via email function', e)
      }

      return json(data && data[0] ? data[0] : data)
    }

    if (req.method === 'PATCH' || req.method === 'PUT') {
      if (isClientUser) return json({ error: 'Forbidden: clients cannot update client records' }, 403)
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
      if (isClientUser) return json({ error: 'Forbidden: clients cannot delete client records' }, 403)
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
