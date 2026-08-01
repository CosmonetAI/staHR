import React, { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { supabase } from '../supabase/supabaseClient'

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
  const [isRecovery, setIsRecovery] = useState(false)
  const [sessionExists, setSessionExists] = useState(false)
  const [newPwdLoading, setNewPwdLoading] = useState(false)
  const [newPwdError, setNewPwdError] = useState<string | null>(null)
  const [newPwdMsg, setNewPwdMsg] = useState<string | null>(null)

  React.useEffect(() => {
    // Detect recovery mode: query param type=recovery or access_token in hash
    try {
      const search = typeof window !== 'undefined' ? window.location.search : ''
      const hash = typeof window !== 'undefined' ? window.location.hash : ''
      const params = new URLSearchParams(search)
      const type = params.get('type')
      const hasAccessToken = search.includes('access_token') || hash.includes('access_token')
      if (type === 'recovery' || hasAccessToken) {
        setIsRecovery(true)
      }
    } catch (e) {}

    // Check if supabase client has created a session from URL (detectSessionInUrl=true)
    supabase.auth.getSession().then(({ data }: any) => {
      if (data?.session) setSessionExists(true)
    }).catch(() => {
      setSessionExists(false)
    })
  }, [])

  const navigate = useNavigate()

  const handleNewPassword = async (vals: any) => {
    setNewPwdError(null)
    setNewPwdMsg(null)
    setNewPwdLoading(true)
    try {
      if (!vals.password || vals.password.length < 6) throw new Error('Password must be at least 6 characters')
      const { data, error } = await supabase.auth.updateUser({ password: vals.password } as any)
      if (error) throw error
      setNewPwdMsg('Password updated successfully. You can now sign in.')
      // navigate to login after short delay
      setTimeout(() => {
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
        <div style={{ marginBottom: 12 }}>Set a new password for your account.</div>
        {!sessionExists && <div style={{ marginBottom: 12 }} className="field-error">Unable to detect a recovery session. Make sure you clicked the link from your email and the redirect URL matches this app.</div>}
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
