import React, { useState } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { useAuth } from '../hooks/useAuth'

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
})
type Form = z.infer<typeof schema>

// lightweight zod resolver to avoid depending on @hookform/resolvers
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

export default function Login() {
  const { signIn } = useAuth()
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
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const goToRedirect = () => {
    if (!redirect) {
      navigate('/')
      return
    }
    if (/^https?:\/\//i.test(redirect)) {
      window.location.href = redirect
      return
    }
    navigate(redirect.startsWith('/') ? redirect : '/')
  }

  const onSubmit = async (data: Form) => {
    setServerError(null)
    setLoading(true)
    try {
      await signIn(data.email, data.password)
      goToRedirect()
    } catch (err: any) {
      const msg = err?.message || String(err)
      console.error('SignIn error', err)
      setServerError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container">
      <div className="card login-card" style={{ maxWidth: 420, margin: '48px auto' }}>
        <h2>Login</h2>
        
        <form onSubmit={handleSubmit(onSubmit)} className="login-form" noValidate>
          <div className="field" style={{ marginBottom: 12 }}>
            <label className="field-label">Email</label>
            <input aria-invalid={!!errors.email} placeholder="you@company.com" {...register('email')} />
            {errors.email && <div className="field-error">{errors.email.message as unknown as string}</div>}
          </div>

          <div className="field" style={{ marginBottom: 12, position: 'relative' }}>
            <label className="field-label">Password</label>
            <div className="input-wrap">
              <input
                placeholder="Enter password"
                type={showPassword ? 'text' : 'password'}
                {...register('password')}
                aria-invalid={!!errors.password}
              />
              <button type="button" className="show-pass-btn" onClick={() => setShowPassword(s => !s)} aria-label="Toggle password visibility">
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            {errors.password && <div className="field-error">{errors.password.message as unknown as string}</div>}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <label style={{ fontSize: 13 }}><input type="checkbox" style={{ marginRight: 8 }} /> Remember me</label>
            <Link style={{ fontSize: 13, color: 'var(--primary)' }} to={`/reset${linkedSuffix}`}>Forgot?</Link>
          </div>

          {serverError && <div className="field-error" style={{ marginBottom: 12 }}>{serverError}</div>}

          <button type="submit" className="btn btn-primary submit-btn" disabled={loading}>
            {loading ? <span className="spinner" aria-hidden="true" /> : 'Sign in'}
          </button>
        </form>
        <div style={{ marginTop: 12, textAlign: 'center' }}>
          <Link to={`/signup${linkedSuffix}`}>Create an account</Link>
        </div>
      </div>
    </div>
  )
}
