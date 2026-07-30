import { serve } from 'https://deno.land/std@0.203.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js'

const SUPABASE_URL = Deno.env.get('PROJECT_SUPABASE_URL') || Deno.env.get('SUPABASE_URL') || Deno.env.get('VITE_SUPABASE_URL')
const SUPABASE_ANON_KEY = Deno.env.get('PROJECT_SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('VITE_SUPABASE_ANON_KEY')

let sb: any = null
if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  sb = createClient(String(SUPABASE_URL), String(SUPABASE_ANON_KEY))
} else {
  console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY env vars')
}

serve(async (req) => {
  const origin = req.headers.get('origin') || '*'
  const corsHeaders = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
    'Access-Control-Allow-Credentials': 'true'
  }

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })

  if (!sb) return new Response(JSON.stringify({ error: 'Server misconfiguration: missing SUPABASE_URL or SUPABASE_ANON_KEY' }), { status: 500, headers: corsHeaders })

  try {
    const json = (data: any, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

    const txt = await req.text()
    let body: any = {}
    if (txt && txt.trim()) {
      try { body = JSON.parse(txt) } catch (err) { return json({ error: 'Invalid JSON body' }, 400) }
    }

    const type = body.type || (body.action || 'reset')
    const email = body.email || body.to
    if (!email) return json({ error: 'Missing email' }, 400)

    // default to localhost for dev when no APP_URL/SITE_URL is set
    const appUrl = Deno.env.get('APP_URL') || Deno.env.get('SITE_URL') || 'http://localhost:3000'
    // prefer explicit redirect from caller, then env, then request origin
    let redirectTo = body.redirectTo || (appUrl ? `${appUrl}/reset` : undefined)
    // if no redirectTo yet, try to use the incoming request origin header
    if (!redirectTo) {
      const reqOrigin = req.headers.get('origin') || req.headers.get('referer') || undefined
      if (reqOrigin) redirectTo = `${reqOrigin.replace(/\/$/, '')}/reset`
    }
    // ensure redirectTo is an absolute URL with protocol; if caller passed something like 'localhost:5173', prefix http://
    if (redirectTo && !/^https?:\/\//i.test(redirectTo)) {
      redirectTo = `http://${redirectTo}`
    }

    console.log('Email function sending type=', type, 'email=', email, 'redirectTo=', redirectTo)

    if (type === 'reset' || type === 'invite') {
      try {
        await sb.auth.resetPasswordForEmail(String(email), redirectTo ? { redirectTo } as any : undefined as any)
        return json({ ok: true })
      } catch (e) {
        console.error('resetPasswordForEmail failed', e)
        return json({ error: String(e) }, 500)
      }
    }

    // future types (notifications, templated mails) can be implemented here
    return json({ error: 'Unknown email type' }, 400)
  } catch (e) {
    console.error('email function error', e)
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})
