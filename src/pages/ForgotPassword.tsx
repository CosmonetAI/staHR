import React, { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { useAuth } from '../hooks/useAuth'

const schema = z.object({
  email: z.string().email()
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

export default function ForgotPassword() {
  const { resetPassword } = useAuth()
  const [searchParams] = useSearchParams()
  const { register, handleSubmit, formState: { errors } } = useForm<Form>({ resolver: zodResolverInline(schema) as any })
  const [loading, setLoading] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const onSubmit = async (data: Form) => {
    setServerError(null)
    setSent(false)
    setLoading(true)
    try {
      await resetPassword(data.email)
      setSent(true)
    } catch (err: any) {
      setServerError(err?.message || String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container">
      <div className="card login-card" style={{ maxWidth: 420, margin: '48px auto' }}>
        <h2>Reset password</h2>
        <p style={{ marginTop: 0, color: 'var(--muted)', fontSize: 14 }}>
          Enter your email and we will send you a password reset link.
        </p>

        <form onSubmit={handleSubmit(onSubmit)} className="login-form" noValidate>
          <div className="field" style={{ marginBottom: 12 }}>
            <label className="field-label">Email</label>
            <input aria-invalid={!!errors.email} placeholder="you@company.com" {...register('email')} />
            {errors.email && <div className="field-error">{errors.email.message as unknown as string}</div>}
          </div>

          {sent && (
            <div style={{ marginBottom: 12, padding: 8, background: '#ecfdf5', color: '#065f46', borderRadius: 6, fontSize: 13 }}>
              If an account exists for that email, a reset link has been sent.
            </div>
          )}
          {serverError && <div className="field-error" style={{ marginBottom: 12 }}>{serverError}</div>}

          <button type="submit" className="btn btn-primary submit-btn" disabled={loading}>
            {loading ? <span className="spinner" aria-hidden="true" /> : 'Send reset link'}
          </button>
        </form>

        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <Link style={{ fontSize: 13, color: 'var(--primary)' }} to={`/login${searchParams.get('redirect') ? `?redirect=${encodeURIComponent(searchParams.get('redirect') || '')}` : ''}`}>Back to login</Link>
        </div>
      </div>
    </div>
  )
}
