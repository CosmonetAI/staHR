import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { useAuth } from '../hooks/useAuth'

const isDevLogin = import.meta.env.VITE_ALLOW_DEV_LOGIN === 'true'
const schema = z.object({
  email: isDevLogin ? z.string().min(1) : z.string().email(),
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
  const { register, handleSubmit, formState: { errors } } = useForm<Form>({ resolver: zodResolverInline(schema) as any })
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const onSubmit = async (data: Form) => {
    setServerError(null)
    setLoading(true)
    try {
      await signIn(data.email, data.password)
      navigate('/')
    } catch (err: any) {
      const msg = err?.message || String(err)
      setServerError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container">
      <div className="card login-card" style={{ maxWidth: 420, margin: '48px auto' }}>
        <h2>Login</h2>
        {import.meta.env.VITE_ALLOW_DEV_LOGIN === 'true' && (
          <div style={{ marginBottom: 12, padding: 8, background: '#f1f5f9', borderRadius: 6 }}>
            <div style={{ fontWeight: 600 }}>Dev login enabled</div>
            <div style={{ fontSize: 13 }}>Use email <strong>{import.meta.env.VITE_DEV_USER_EMAIL || 'dev@local'}</strong> and password <strong>{import.meta.env.VITE_DEV_USER_PASS || 'devpass'}</strong></div>
          </div>
        )}
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
            <a style={{ fontSize: 13, color: 'var(--primary)' }} href="#">Forgot?</a>
          </div>

          {serverError && <div className="field-error" style={{ marginBottom: 12 }}>{serverError}</div>}

          <button type="submit" className="btn btn-primary submit-btn" disabled={loading}>
            {loading ? <span className="spinner" aria-hidden="true" /> : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
