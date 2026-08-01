import { serve } from 'https://deno.land/std@0.203.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js'
// optional SMTP support for custom emails
import nodemailer from 'npm:nodemailer'

const SUPABASE_URL = Deno.env.get('PROJECT_SUPABASE_URL') || Deno.env.get('SUPABASE_URL') || Deno.env.get('VITE_SUPABASE_URL')
const SUPABASE_ANON_KEY = Deno.env.get('PROJECT_SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('VITE_SUPABASE_ANON_KEY')
const SUPABASE_SERVICE_ROLE = Deno.env.get('PROJECT_SUPABASE_SERVICE_ROLE') || Deno.env.get('SUPABASE_SERVICE_ROLE') || Deno.env.get('VITE_SUPABASE_SERVICE_ROLE') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('PROJECT_SUPABASE_SERVICE_ROLE_KEY')

let sb: any = null
let sbAdmin: any = null
if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  sb = createClient(String(SUPABASE_URL), String(SUPABASE_ANON_KEY))
} else {
  console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY env vars')
}

const buildFrom = () => {
  const fromEmail = Deno.env.get('SMTP_FROM_EMAIL') || Deno.env.get('SMTP_FROM') || Deno.env.get('SMTP_USER') || ''
  const fromName = Deno.env.get('SMTP_FROM_NAME') || ''
  if (fromName && fromEmail) return `${fromName} <${fromEmail}>`
  if (fromEmail) return fromEmail
  try {
    return `no-reply@${(new URL(String(SUPABASE_URL || '') || 'https://example.com')).hostname}`
  } catch (e) {
    return 'no-reply@example.com'
  }
}
if (SUPABASE_URL && SUPABASE_SERVICE_ROLE) {
  try {
    sbAdmin = createClient(String(SUPABASE_URL), String(SUPABASE_SERVICE_ROLE))
  } catch (e) {
    console.warn('Failed to create admin Supabase client', e)
    sbAdmin = null
  }
}

// Create and verify an SMTP transporter; return null if SMTP not configured or verification fails
const createVerifiedTransporter = async () => {
  if (!Deno.env.get('SMTP_HOST')) return null
  try {
    const host = String(Deno.env.get('SMTP_HOST'))
    const port = Number(Deno.env.get('SMTP_PORT') || 587)
    const secure = String(Deno.env.get('SMTP_SECURE')) === 'true' || port === 465
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user: Deno.env.get('SMTP_USER') || undefined,
        pass: Deno.env.get('SMTP_PASS') || undefined
      }
    } as any)

    // verify connection configuration (will throw if it can't connect)
    try {
      await transporter.verify()
      return transporter
    } catch (err) {
      console.error('SMTP transport verify failed', err)
      return null
    }
  } catch (e) {
    console.error('Failed to create SMTP transporter', e)
    return null
  }
}

// build a simple action email HTML with a CTA button
const buildActionEmailHtml = ({ appName, actionLink, actionText, actionLabel }: { appName: string; actionLink: string; actionText: string; actionLabel: string }) => {
  const safeApp = String(appName || 'App')
  const safeActionText = String(actionText || '')
  const safeActionLabel = String(actionLabel || 'Open')
  const cta = actionLink ? `<a href="${actionLink}" style="background-color:#2563eb;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;display:inline-block">${safeActionLabel}</a>` : ''
  return `
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #111;">
    <h2 style="color:#0f172a">${safeApp}</h2>
    <p>${safeActionText}</p>
    <p style="margin:18px 0">${cta}</p>
    <hr style="border:none;border-top:1px solid #e6e6e6;margin:18px 0" />
    <p style="color:#6b7280;font-size:13px">If the button doesn't work, copy and paste this link into your browser:</p>
    <p style="font-size:13px;color:#0369a1;word-break:break-all">${actionLink}</p>
  </div>`
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
    // debug: report presence of critical env vars (masked)
    try {
      const sr = SUPABASE_SERVICE_ROLE ? true : false
      const ak = SUPABASE_ANON_KEY ? true : false
      const sh = Deno.env.get('SMTP_HOST') ? true : false
      console.log('env presence: SUPABASE_SERVICE_ROLE=', sr, 'SUPABASE_ANON_KEY=', ak, 'SMTP_HOST=', sh)
    } catch (e) {
      console.warn('failed to check env presence', e)
    }
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

    // default to production site when no APP_URL/SITE_URL is set
    const appUrl = Deno.env.get('APP_URL') || Deno.env.get('SITE_URL') || 'https://stahr.onrender.com'
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
      // Prefer SMTP-based sending of reset/invite by generating an admin action link
      // and emailing it via SMTP. This requires a service role key in env vars.
      // prefer using the admin client if available
      if (sbAdmin && Deno.env.get('SMTP_HOST')) {
        try {
          const action = type === 'reset' ? 'recovery' : 'invite'
          const genResp: any = await sbAdmin.auth.admin.generateLink({ type: action, email: String(email), redirect_to: redirectTo } as any)
          const genJson = genResp?.data || genResp

          // Prefer hashed token when present so we can build a deterministic verify link
          const hashedToken = genJson?.properties?.hashed_token ?? genJson?.hashed_token ?? null
          const actionLink = genJson?.properties?.action_link || genJson?.action_link || genJson?.url || genJson?.action_link_url || genJson?.link || null
          const returnedRedirectBase = genJson?.properties?.redirect_to ?? genJson?.redirect_to ?? null
          const chosenRedirectBase = (returnedRedirectBase && String(returnedRedirectBase).trim()) || (redirectTo || appUrl)
          const desiredPath = action === 'recovery' ? '/reset' : '/set-password'
          let redirectToFinal: string | undefined = undefined
          if (chosenRedirectBase) {
            const baseClean = String(chosenRedirectBase).replace(/\/+$/, '')
            redirectToFinal = baseClean.endsWith(desiredPath) ? baseClean : `${baseClean}${desiredPath}`
          }

          let finalActionLink: string | null = null
          if (hashedToken) {
            const baseAuth = SUPABASE_URL.replace(/\/+$/, '')
            finalActionLink = `${baseAuth}/auth/v1/verify?token=${hashedToken}&type=${action}&redirect_to=${encodeURIComponent(redirectToFinal || '')}`
          } else if (actionLink) {
            try {
              const actionUrl = new URL(actionLink)
              if (redirectToFinal) actionUrl.searchParams.set('redirect_to', redirectToFinal)
              finalActionLink = actionUrl.toString()
            } catch (e) {
              finalActionLink = actionLink
            }
          }

          if (!finalActionLink) {
            console.error('generate_link (admin client) missing action link', genJson)
            // fallthrough to try fetch path
          } else {
            // attempt to create and verify SMTP transporter
            const transporter = await createVerifiedTransporter()
            if (transporter) {
              const from = buildFrom()
              const appName = Deno.env.get('APP_NAME') || 'staHR'
              const subject = type === 'reset' ? (body.subject || `Reset your ${appName} password`) : (body.subject || `You're invited to join ${appName}`)
              const actionText = type === 'reset' ? (body.text || `Reset your password`) : (body.text || `You're invited to join ${appName}`)
              const html = body.html || buildActionEmailHtml({ appName, actionLink: finalActionLink, actionText, actionLabel: type === 'reset' ? 'Reset password' : 'Set your password' })
              const text = body.text || `${actionText}: ${finalActionLink}`
              await transporter.sendMail({ from, to: String(email), subject, text, html })
              return json({ ok: true })
            }
            console.warn('SMTP not available or verify failed; falling back to Supabase-managed email')
          }
        } catch (e) {
          console.error('admin generate/send failed (admin client)', e)
          // fallthrough to fetch path
        }
      }

      // if admin client not available or failed, try generate_link via REST
      // only try REST generation if we have a service role key
      if (Deno.env.get('SMTP_HOST') && SUPABASE_SERVICE_ROLE) {
        try {
          const action = type === 'reset' ? 'recovery' : 'invite'
          const genResp = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/auth/v1/admin/generate_link`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': String(SUPABASE_ANON_KEY || ''),
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE}`
            },
            body: JSON.stringify({ type: action, email: String(email), redirect_to: redirectTo })
          })

          if (!genResp.ok) {
            const txt = await genResp.text()
            console.error('generate_link failed', genResp.status, txt)
            // fallthrough to fallback
          } else {
            const genJson = await genResp.json() as any
            const hashedToken = genJson?.properties?.hashed_token ?? genJson?.hashed_token ?? null
            const actionLink = genJson.action_link || genJson.url || genJson.action_link_url || null
            const returnedRedirectBase = genJson?.properties?.redirect_to ?? genJson?.redirect_to ?? null
            const chosenRedirectBase = (returnedRedirectBase && String(returnedRedirectBase).trim()) || (redirectTo || appUrl)
            const desiredPath = action === 'recovery' ? '/reset' : '/set-password'
            let redirectToFinal: string | undefined = undefined
            if (chosenRedirectBase) {
              const baseClean = String(chosenRedirectBase).replace(/\/+$/, '')
              redirectToFinal = baseClean.endsWith(desiredPath) ? baseClean : `${baseClean}${desiredPath}`
            }

            let finalActionLink: string | null = null
            if (hashedToken) {
              const baseAuth = SUPABASE_URL.replace(/\/+$/, '')
              finalActionLink = `${baseAuth}/auth/v1/verify?token=${hashedToken}&type=${action}&redirect_to=${encodeURIComponent(redirectToFinal || '')}`
            } else if (actionLink) {
              try {
                const actionUrl = new URL(actionLink)
                if (redirectToFinal) actionUrl.searchParams.set('redirect_to', redirectToFinal)
                finalActionLink = actionUrl.toString()
              } catch (e) {
                finalActionLink = actionLink
              }
            }

            if (!finalActionLink) {
              console.error('generate_link missing action link', genJson)
              // fallthrough to fallback
            } else {
              // attempt to create and verify SMTP transporter
              const transporter = await createVerifiedTransporter()
              if (transporter) {
                const from = buildFrom()
                const appName = Deno.env.get('APP_NAME') || 'staHR'
                const subject = type === 'reset' ? (body.subject || `Reset your ${appName} password`) : (body.subject || `You're invited to join ${appName}`)
                const actionText = type === 'reset' ? (body.text || `Reset your password`) : (body.text || `You're invited to join ${appName}`)
                const html = body.html || buildActionEmailHtml({ appName, actionLink: finalActionLink, actionText, actionLabel: type === 'reset' ? 'Reset password' : 'Set your password' })
                const text = body.text || `${actionText}: ${finalActionLink}`

                await transporter.sendMail({ from, to: String(email), subject, text, html })
                return json({ ok: true })
              }
              console.warn('SMTP not available or verify failed; falling back to Supabase-managed email')
            }
          }
        } catch (e) {
          console.error('generate_link/send failed (fetch)', e)
          // fallthrough to fallback
        }
      }

      // Fallback to default Supabase client behavior (uses project's SMTP configured in dashboard)
      try {
        await sb.auth.resetPasswordForEmail(String(email), redirectTo ? { redirectTo } as any : undefined as any)
        return json({ ok: true })
      } catch (e) {
        console.error('resetPasswordForEmail failed', e)
        return json({ error: String(e) }, 500)
      }
    }

    // support a custom SMTP-based send for other types (notifications, templated mails)
    if (Deno.env.get('SMTP_HOST') && (type === 'notification' || type === 'custom' || type === 'notify')) {
      const subject = body.subject || `Message from ${Deno.env.get('APP_NAME') || 'staHR'}`
      const text = body.text || body.message || ''
      const html = body.html || (text ? `<p>${text}</p>` : undefined)

      try {
        const transporter = nodemailer.createTransport({
          host: String(Deno.env.get('SMTP_HOST')),
          port: Number(Deno.env.get('SMTP_PORT') || 587),
          secure: String(Deno.env.get('SMTP_SECURE')) === 'true' || Number(Deno.env.get('SMTP_PORT') || 587) === 465,
          auth: {
            user: Deno.env.get('SMTP_USER') || undefined,
            pass: Deno.env.get('SMTP_PASS') || undefined
          }
        } as any)

        const from = buildFrom()

        await transporter.sendMail({ from, to: String(email), subject, text, html })
        return json({ ok: true })
      } catch (e) {
        console.error('SMTP send failed', e)
        return json({ error: String(e) }, 500)
      }
    }

    // future types can be implemented here
    return json({ error: 'Unknown email type' }, 400)
  } catch (e) {
    console.error('email function error', e)
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})
