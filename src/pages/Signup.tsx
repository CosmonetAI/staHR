import React, { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { useAuth } from '../hooks/useAuth'

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  full_name: z.string().min(1)
})
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

export default function Signup() {
  const { signUp } = useAuth() as any
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const redirect = searchParams.get('redirect') || ''
  const email = searchParams.get('email') || ''
  const linkedParams = new URLSearchParams()
  if (redirect) linkedParams.set('redirect', redirect)
  if (email) linkedParams.set('email', email)
  const linkedQuery = linkedParams.toString()
  const linkedSuffix = linkedQuery ? `?${linkedQuery}` : ''
  const { register, handleSubmit, formState: { errors } } = useForm<Form>({
    resolver: zodResolverInline(schema) as any,
    defaultValues: { email }
  })
  const [loading, setLoading] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [infoMessage, setInfoMessage] = useState<string | null>(null)

  const onSubmit = async (data: Form) => {
    setServerError(null)
    setLoading(true)
    try {
      const res = await signUp({ email: data.email, password: data.password, full_name: data.full_name })
      // If Supabase returned a session/user (auto-signed-in), redirect to app
      const signedUser = res?.user ?? res?.session?.user ?? null
      if (signedUser) {
        if (/^https?:\/\//i.test(redirect || '')) window.location.href = redirect || '/'
        else navigate(redirect && redirect.startsWith('/') ? redirect : '/')
        return
      }
      // Otherwise show confirmation instructions and redirect to login
      setInfoMessage('Check your email for a confirmation link. After confirming, return to login to sign in.')
      navigate(`/login${linkedSuffix}`)
    } catch (err: any) {
      setServerError(err?.message || String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container">
      <div className="card login-card" style={{ maxWidth: 520, margin: '48px auto' }}>
        <h2>Sign up</h2>
        <form onSubmit={handleSubmit(onSubmit)} className="login-form" noValidate>
          <div className="field" style={{ marginBottom: 12 }}>
            <label className="field-label">Full name</label>
            <input placeholder="Jane Doe" {...register('full_name')} />
            {errors.full_name && <div className="field-error">{errors.full_name.message as unknown as string}</div>}
          </div>

          <div className="field" style={{ marginBottom: 12 }}>
            <label className="field-label">Email</label>
            <input placeholder="you@company.com" {...register('email')} />
            {errors.email && <div className="field-error">{errors.email.message as unknown as string}</div>}
          </div>

          <div className="field" style={{ marginBottom: 12 }}>
            <label className="field-label">Password</label>
            <input placeholder="Enter password" type="password" {...register('password')} />
            {errors.password && <div className="field-error">{errors.password.message as unknown as string}</div>}
          </div>

          {serverError && <div className="field-error" style={{ marginBottom: 12 }}>{serverError}</div>}
          {infoMessage && <div style={{ marginBottom: 12, background: '#f8fafc', padding: 10, borderRadius: 6 }}>{infoMessage}</div>}

          <button type="submit" className="btn btn-primary submit-btn" disabled={loading}>
            {loading ? <span className="spinner" aria-hidden="true" /> : 'Create account'}
          </button>
        </form>
      </div>
    </div>
  )
}
