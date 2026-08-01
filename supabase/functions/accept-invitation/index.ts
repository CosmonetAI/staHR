import { serve } from 'https://deno.land/std@0.203.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js'

const jsonResponse = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers }
  })

serve(async (req) => {
  const corsHeaders: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
  }

  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405, corsHeaders)

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
  const SUPABASE_SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('PROJECT_SUPABASE_SERVICE_ROLE')
  const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('VITE_SUPABASE_ANON_KEY')

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE || !SUPABASE_ANON_KEY) {
    return jsonResponse({ error: 'Missing server configuration' }, 500, corsHeaders)
  }

  try {
    const authHeader = req.headers.get('authorization') || ''
    const token = authHeader.replace(/^Bearer\s+/i, '')
    if (!token) return jsonResponse({ error: 'Unauthorized' }, 401, corsHeaders)

    const authClient = createClient(String(SUPABASE_URL), String(SUPABASE_ANON_KEY), { auth: { persistSession: false } })
    const { data: authData, error: authError } = await authClient.auth.getUser(token)
    if (authError || !authData?.user?.id || !authData.user.email) {
      return jsonResponse({ error: 'Unauthorized' }, 401, corsHeaders)
    }

    const userId = authData.user.id
    const userEmail = String(authData.user.email).toLowerCase()
    const adminClient = createClient(String(SUPABASE_URL), String(SUPABASE_SERVICE_ROLE), { auth: { persistSession: false } })

    const { data: invitation, error: inviteError } = await adminClient
      .from('invitations')
      .select('id, org_id, role, invited_by, expires_at, status')
      .eq('status', 'pending')
      .ilike('email', userEmail)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (inviteError) return jsonResponse({ error: inviteError.message }, 500, corsHeaders)
    if (!invitation || !invitation.org_id) return jsonResponse({ accepted: false }, 200, corsHeaders)

    if (invitation.expires_at && new Date(invitation.expires_at).getTime() < Date.now()) {
      return jsonResponse({ accepted: false }, 200, corsHeaders)
    }

    const { error: updateError } = await adminClient
      .from('invitations')
      .update({ status: 'accepted', accepted_at: new Date().toISOString(), auth_user_id: userId })
      .eq('id', invitation.id)
      .eq('status', 'pending')

    if (updateError) return jsonResponse({ error: updateError.message }, 500, corsHeaders)

    const memberRole = invitation.role === 'admin' ? 'admin' : 'member'
    const { error: addMemberError } = await adminClient.rpc('add_org_member', {
      target_org_id: invitation.org_id,
      target_user_id: userId,
      member_role: memberRole,
      inviter_user_id: invitation.invited_by
    })

    if (addMemberError) return jsonResponse({ error: addMemberError.message }, 500, corsHeaders)

    await adminClient
      .from('profiles')
      .update({ current_org_id: invitation.org_id })
      .eq('user_id', userId)
      .is('current_org_id', null)

    return jsonResponse({ accepted: true, org_id: invitation.org_id, invitation_id: invitation.id }, 200, corsHeaders)
  } catch (e: any) {
    console.error('accept-invitation error', e)
    return jsonResponse({ error: String(e) }, 500, corsHeaders)
  }
})
