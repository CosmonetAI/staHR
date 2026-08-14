import React, { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../supabase/supabaseClient'

type Mode = 'login' | 'signup' | 'reset'
const OAUTH_CONTINUE_STORAGE_KEY = 'cosmonet_oauth_continue_url'
const SALES_ADVISOR_OAUTH_START_URL =
  String(import.meta.env.VITE_SALES_ADVISOR_OAUTH_START_URL || '') ||
  'https://sales-backend-50mp.onrender.com/api/v1/auth/oauth/start'

const APP_COPY: Record<string, { name: string; eyebrow: string; color: string; soft: string }> = {
  'sales-advisor': {
    name: 'AI Sales Advisor',
    eyebrow: 'Shopify workspace access',
    color: '#17b89a',
    soft: '#e8f8f4'
  },
  default: {
    name: 'Cosmonet AI Account',
    eyebrow: 'Secure app access',
    color: '#10b981',
    soft: '#ecfdf5'
  }
}

function isSafeRedirect(value: string) {
  return /^https?:\/\//i.test(value) || value.startsWith('/')
}

function isTrustedOAuthContinue(value: string) {
  try {
    const expected = new URL(SALES_ADVISOR_OAUTH_START_URL)
    const candidate = new URL(value)
    return candidate.origin === expected.origin && candidate.pathname === expected.pathname
  } catch {
    return false
  }
}

function buildQuery(params: URLSearchParams, nextMode: Mode) {
  const next = new URLSearchParams()
  const redirect = params.get('redirect') || ''
  const email = params.get('email') || ''
  const name = params.get('name') || ''
  const app = params.get('app') || ''
  if (redirect) next.set('redirect', redirect)
  if (email) next.set('email', email)
  if (name) next.set('name', name)
  if (app) next.set('app', app)
  const query = next.toString()
  return `/oauth/${nextMode}${query ? `?${query}` : ''}`
}

export default function OAuthAuth({ mode }: { mode: Mode }) {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const redirect = params.get('redirect') || ''
  const appKey = params.get('app') || 'default'
  const app = APP_COPY[appKey] || APP_COPY.default
  const [email, setEmail] = useState(params.get('email') || '')
  const [fullName, setFullName] = useState(params.get('name') || '')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const title =
    mode === 'login'
      ? `Sign in to ${app.name}`
      : mode === 'signup'
        ? `Create your ${app.name} access`
        : 'Reset your password'
  const subtitle =
    mode === 'login'
      ? 'Use your Cosmonet AI account to continue securely.'
      : mode === 'signup'
        ? 'We will email a secure invite link so you can set your password.'
        : 'We will send a secure password reset link to your email.'

  const goToRedirect = () => {
    if (!redirect) {
      navigate('/')
      return
    }
    if (!isSafeRedirect(redirect)) {
      navigate('/')
      return
    }
    if (/^https?:\/\//i.test(redirect)) window.location.href = redirect
    else navigate(redirect)
  }

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)
    try {
      const normalizedEmail = email.trim().toLowerCase()
      if (!normalizedEmail || !normalizedEmail.includes('@')) throw new Error('Enter a valid email address.')

      if (mode === 'login') {
        if (password.length < 6) throw new Error('Enter your password.')
        const { error: signInError } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password })
        if (signInError) throw signInError
        goToRedirect()
        return
      }

      if (mode === 'reset') {
        const resetUrl = new URL('/set-password', window.location.origin)
        resetUrl.searchParams.set('app', appKey)
        if (isTrustedOAuthContinue(redirect)) {
          resetUrl.searchParams.set('continue', redirect)
          resetUrl.searchParams.set('oauth_redirect', redirect)
          try { localStorage.setItem(OAUTH_CONTINUE_STORAGE_KEY, redirect) } catch (e) {}
        }
        resetUrl.searchParams.set('email', normalizedEmail)
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
          redirectTo: resetUrl.toString()
        } as any)
        if (resetError) throw resetError
        setMessage('Check your email for the secure password reset link.')
        return
      }

      if (mode === 'signup' && fullName.trim().length < 2) throw new Error('Enter your name.')
      if (isTrustedOAuthContinue(redirect)) {
        try { localStorage.setItem(OAUTH_CONTINUE_STORAGE_KEY, redirect) } catch (e) {}
      }
      const response = await fetch('/api/oauth/invite-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: normalizedEmail,
          full_name: fullName.trim() || normalizedEmail,
          app: appKey,
          redirect
        })
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error || 'Unable to send invite email.')
      setMessage('Invite sent. Check your email to set your password and continue.')
    } catch (err: any) {
      setError(err?.message || String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="oauth-auth-shell">
      <section className="oauth-auth-card">
        <div className="oauth-auth-brand" style={{ background: app.soft, color: app.color }}>
          <span className="oauth-auth-mark">C</span>
          <span>{app.eyebrow}</span>
        </div>
        <h1>{title}</h1>
        <p className="oauth-auth-subtitle">{subtitle}</p>

        <form className="oauth-auth-form" onSubmit={onSubmit}>
          {mode === 'signup' ? (
            <label>
              Name
              <input value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" placeholder="Your name" />
            </label>
          ) : null}
          <label>
            Email
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" placeholder="you@company.com" />
          </label>
          {mode === 'login' ? (
            <label>
              Password
              <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" placeholder="Enter password" />
            </label>
          ) : null}
          {error ? <div className="oauth-auth-error">{error}</div> : null}
          {message ? <div className="oauth-auth-message">{message}</div> : null}
          <button type="submit" disabled={loading} style={{ background: app.color }}>
            {loading ? 'Please wait' : mode === 'login' ? 'Sign in securely' : mode === 'signup' ? 'Send invite link' : 'Send reset link'}
          </button>
        </form>

        <div className="oauth-auth-links">
          {mode !== 'login' ? <Link to={buildQuery(params, 'login')}>Back to sign in</Link> : null}
          {mode !== 'signup' ? <Link to={buildQuery(params, 'signup')}>Create account</Link> : null}
          {mode !== 'reset' ? <Link to={buildQuery(params, 'reset')}>Forgot password?</Link> : null}
        </div>

        <p className="oauth-auth-footer">
          Secure account access by{' '}
          <a href="https://cosmonet.ai" target="_blank" rel="noreferrer">Cosmonet AI</a>
        </p>
      </section>
    </main>
  )
}
