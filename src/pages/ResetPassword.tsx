import React, { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { supabase } from '../supabase/supabaseClient'
import { useAuth } from '../hooks/useAuth'

const hasRecoveryParams = () => {
  try {
    const searchParams = new URLSearchParams(window.location.search || '')
    const rawHash = (window.location.hash || '').replace(/^#/, '')
    const hashParams = new URLSearchParams(rawHash)
    const pathname = (window.location.pathname || '').replace(/\/$/, '')
    // debug
    try { console.debug('hasRecoveryParams', { pathname, search: window.location.search, hash: rawHash, searchParams: Object.fromEntries(searchParams.entries()), hashParams: Object.fromEntries(hashParams.entries()) }) } catch (e) {}
    return (
      pathname === '/set-password' ||
      searchParams.get('recovery') === '1' ||
      searchParams.get('type') === 'recovery' ||
      searchParams.get('type') === 'invite' ||
      hashParams.get('type') === 'recovery' ||
      hashParams.get('type') === 'invite' ||
      hashParams.has('access_token') ||
      hashParams.has('refresh_token')
    )
  } catch (e) {
    return false
  }
}

const schema = z.object({ email: z.string().email() })
type Form = z.infer<typeof schema>

const zodResolverInline = (schema: z.ZodTypeAny) => async (values: any) => {
  try {
    const parsed = schema.parse(values)
    return { values: parsed, errors: {} }
  } catch (err: any) {
    const formatted: Record<string, any> = {}
    if (err?.issues && Array.isArray(err.issues)) {
      err.issues.forEach((issue: any) => {
        const key = issue.path && issue.path.length ? String(issue.path[0]) : '_'
        formatted[key] = { type: issue.code || 'validation', message: issue.message }
      })
    }
    return { values: {}, errors: formatted }
  }
}

export default function ResetPassword() {
  const { register, handleSubmit, formState: { errors } } = useForm<Form>({ resolver: zodResolverInline(schema) as any })
  const [loading, setLoading] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [infoMessage, setInfoMessage] = useState<string | null>(null)

  const onSubmit = async (data: Form) => {
    setServerError(null)
    setInfoMessage(null)
    setLoading(true)
    try {
      const redirectTo = (typeof window !== 'undefined' && window.location && window.location.origin) ? `${window.location.origin}/reset` : undefined
      try {
        const FUNCTIONS_BASE = import.meta.env.VITE_FUNCTIONS_BASE || '/functions/v1'
        const anon = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '')
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (anon) {
          headers['apikey'] = anon
          headers['Authorization'] = `Bearer ${anon}`
        }
        const resp = await fetch(`${FUNCTIONS_BASE.replace(/\/$/, '')}/email`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ type: 'reset', email: data.email, redirectTo })
        })
        if (!resp.ok) {
          const text = await resp.text().catch(() => '')
          throw new Error(`Email service error: ${resp.status} ${text}`)
        }
      } catch (err) {
        throw err
      }
      setInfoMessage('If an account exists for that email, you will receive a password recovery email with instructions.')
    } catch (err: any) {
      setServerError(err?.message || String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container">
      <div className="card login-card" style={{ maxWidth: 520, margin: '48px auto' }}>
        <h2>Reset password</h2>
        <ResetPasswordInner
          onRequestSubmit={onSubmit}
          serverError={serverError}
          infoMessage={infoMessage}
          loading={loading}
        />
      </div>
    </div>
  )
}

function ResetPasswordInner({ onRequestSubmit, serverError, infoMessage, loading }: any) {
  const { register, handleSubmit, formState: { errors } } = useForm<any>({ resolver: async (v: any) => ({ values: v, errors: {} }) })
  const [isRecovery, setIsRecovery] = useState(() => {
    try {
      const stored = typeof window !== 'undefined' ? sessionStorage.getItem('supabase_recovery') : null
      if (stored === 'set-password' || stored === 'reset') return true
    } catch (e) {}
    return hasRecoveryParams()
  })
  const [sessionExists, setSessionExists] = useState(false)
  const [newPwdLoading, setNewPwdLoading] = useState(false)
  const [newPwdError, setNewPwdError] = useState<string | null>(null)
  const [newPwdMsg, setNewPwdMsg] = useState<string | null>(null)

  React.useEffect(() => {
    // Detect recovery mode: query param type=recovery or access_token in hash
    try {
      const href = typeof window !== 'undefined' ? window.location.href : ''
      const search = typeof window !== 'undefined' ? window.location.search : ''
      const hash = typeof window !== 'undefined' ? window.location.hash : ''
      console.log('ResetPassword load', { href, search, hash })
      if (hasRecoveryParams()) setIsRecovery(true)
    } catch (e) {}

    // Check if supabase client has created a session from URL (detectSessionInUrl=true)
    // Try explicit URL session resolution first (handles some routing/hash edge cases)
    ;(async () => {
      try {
        // Attempt to parse session from the URL (works when detectSessionInUrl misses)
        if (typeof supabase.auth.getSessionFromUrl === 'function') {
          const fromUrl = await supabase.auth.getSessionFromUrl().catch(() => null)
          console.log('ResetPassword getSessionFromUrl', fromUrl)
          if (fromUrl?.data?.session) {
            setSessionExists(true)
            return
          }
        }

        // Fallback: try several strategies to locate tokens and set the session.
        try {
          const tryParseHash = (raw: string) => {
            if (!raw) return null
            const clean = raw.replace(/^#/, '')
            const params = new URLSearchParams(clean)
            const access_token = params.get('access_token')
            const refresh_token = params.get('refresh_token')
            if (access_token) return { access_token, refresh_token }
            return null
          }

          let tokens: any = null

          // 1) Direct hash on location (normal case)
          if (typeof window !== 'undefined' && window.location.hash) {
            tokens = tryParseHash(window.location.hash)
          }

          // 2) Stashed hash from pre-bootstrap
          if (!tokens && typeof window !== 'undefined') {
            const stashed = sessionStorage.getItem('supabase_auth_hash')
            if (stashed) {
              console.debug('ResetPassword using stashed auth hash from sessionStorage')
              tokens = tryParseHash(stashed)
              try { sessionStorage.removeItem('supabase_auth_hash') } catch (e) {}
            }
          }

          // 3) Encoded redirect in search params (some email links include redirect_to that embeds a hash)
          if (!tokens && typeof window !== 'undefined') {
            try {
              const sp = new URLSearchParams(window.location.search || '')
              // Direct query-param tokens (some redirectors convert #hash to ?access_token=...)
              const qpAccess = sp.get('access_token') || sp.get('accessToken')
              const qpRefresh = sp.get('refresh_token') || sp.get('refreshToken')
              if (qpAccess) {
                console.debug('ResetPassword found tokens in query params')
                tokens = { access_token: qpAccess, refresh_token: qpRefresh }
              }
              const redirectToRaw = sp.get('redirect_to') || sp.get('redirect') || sp.get('redirectTo')
              if (redirectToRaw) {
                const decoded = decodeURIComponent(redirectToRaw)
                const idx = decoded.indexOf('#')
                if (idx !== -1) tokens = tryParseHash(decoded.slice(idx))
              }
            } catch (e) {
              // ignore
            }
          }

          // 4) As a last-ditch, scan full href for an access_token fragment
          if (!tokens && typeof window !== 'undefined') {
            const href = window.location.href || ''
            const m = href.match(/(#|&)access_token=([^&]+)/)
            if (m) {
              const fragment = href.slice(href.indexOf(m[0]) + 1)
              tokens = tryParseHash(fragment)
            }
          }

          if (tokens?.access_token) {
            console.debug('ResetPassword attempting setSession from extracted tokens', { access_token: !!tokens.access_token, refresh_token: !!tokens.refresh_token })
            const setRes = await supabase.auth.setSession({ access_token: tokens.access_token, refresh_token: tokens.refresh_token } as any).catch((e) => ({ error: e }))
            console.debug('ResetPassword setSession result', setRes)
            if (!(setRes as any).error) {
              setSessionExists(true)
              return
            }
            console.warn('ResetPassword setSession failed', setRes)
          }
        } catch (e) {
          console.error('ResetPassword hash fallback error', e)
        }

        // final fallback: ask supabase for current session
        const { data } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }))
        console.log('ResetPassword supabase.getSession', data)
        if (data?.session) setSessionExists(true)
        else setSessionExists(false)
      } catch (err: any) {
        console.error('ResetPassword getSession error', err)
        setSessionExists(false)
      }
    })()
  }, [])

  const navigate = useNavigate()
  const { updatePassword, session, signOut } = useAuth()

  const handleNewPassword = async (vals: any) => {
    setNewPwdError(null)
    setNewPwdMsg(null)
    setNewPwdLoading(true)
    try {
      if (!vals.password || vals.password.length < 6) throw new Error('Password must be at least 6 characters')
      const { error } = await updatePassword(vals.password)
      if (error) throw error
      setNewPwdMsg('Password updated successfully. Finalizing invite...')
      // Attempt to accept any pending invitation for this user (edge function)
      try {
        const accept = await supabase.functions.invoke('accept-invitation')
        if (!accept.error && accept.data && accept.data.accepted) {
          setNewPwdMsg('Invite accepted. Redirecting to dashboard...')
          setTimeout(async () => {
            try { await signOut() } catch (_) {}
            navigate('/recruitment')
          }, 800)
          return
        }
      } catch (e) {
        console.error('accept-invitation failed', e)
      }

      // Sign out and navigate to login after short delay if no invite accepted
      setTimeout(async () => {
        try {
          await signOut()
        } catch (_) {}
        navigate('/login')
      }, 1200)
    } catch (err: any) {
      setNewPwdError(err?.message || String(err))
    } finally {
      setNewPwdLoading(false)
    }
  }

  if (isRecovery) {
    // Show form to set new password (requires session created by Supabase on redirect)
    return (
      <div>
        <div style={{ marginBottom: 8, padding: 8, background: '#fff7ed', border: '1px solid #ffedd5', borderRadius: 6 }}>
          <strong>Recovery mode:</strong> This page is handling a password recovery callback.
        </div>
        <div style={{ marginBottom: 12 }}>Set a new password for your account.</div>
        {!sessionExists && !session && <div style={{ marginBottom: 12 }} className="field-error">Unable to detect a recovery session. Make sure you clicked the link from your email and the redirect URL matches this app. You may still set a password but it may fail if the session is missing.</div>}
        <form onSubmit={handleSubmit(handleNewPassword)} className="login-form" noValidate>
          <div className="field" style={{ marginBottom: 12 }}>
            <label className="field-label">New password</label>
            <input placeholder="Enter new password" type="password" {...register('password')} />
          </div>
          {newPwdError && <div className="field-error" style={{ marginBottom: 12 }}>{newPwdError}</div>}
          {newPwdMsg && <div style={{ marginBottom: 12, background: '#f8fafc', padding: 10, borderRadius: 6 }}>{newPwdMsg}</div>}
          <button type="submit" className="btn btn-primary submit-btn" disabled={newPwdLoading || !sessionExists}>
            {newPwdLoading ? <span className="spinner" aria-hidden="true" /> : 'Set new password'}
          </button>
        </form>
      </div>
    )
  }

  // default: request reset email
  return (
    <form onSubmit={handleSubmit(onRequestSubmit)} className="login-form" noValidate>
      <div className="field" style={{ marginBottom: 12 }}>
        <label className="field-label">Email</label>
        <input placeholder="you@company.com" {...register('email')} />
        {errors.email && <div className="field-error">{errors.email.message as unknown as string}</div>}
      </div>

      {serverError && <div className="field-error" style={{ marginBottom: 12 }}>{serverError}</div>}
      {infoMessage && <div style={{ marginBottom: 12, background: '#f8fafc', padding: 10, borderRadius: 6 }}>{infoMessage}</div>}

      <button type="submit" className="btn btn-primary submit-btn" disabled={loading}>
        {loading ? <span className="spinner" aria-hidden="true" /> : 'Send reset email'}
      </button>
    </form>
  )
}
