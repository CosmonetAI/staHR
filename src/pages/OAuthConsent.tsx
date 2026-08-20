import React, { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../supabase/supabaseClient'

type AuthorizationDetails = {
  client_id?: string
  client_name?: string
  client_metadata?: {
    client_name?: string
    logo_uri?: string
  }
  scopes?: string[]
  redirect_uri?: string
}

function oauthApi() {
  return (supabase.auth as any).oauth
}

function detailPayload(value: any): AuthorizationDetails {
  return (value?.data?.authorization || value?.data || value || {}) as AuthorizationDetails
}

function redirectFromApproval(value: any): string {
  return String(value?.data?.redirect_url || value?.data?.redirectTo || value?.redirect_url || value?.redirectTo || '')
}

function isSalesAdvisorClient(details: AuthorizationDetails | null, clientName: string) {
  const name = clientName.toLowerCase()
  const redirectUri = String(details?.redirect_uri || '').toLowerCase()
  return name.includes('shopify ai sales advisor') || redirectUri.includes('sales-backend-50mp.onrender.com')
}

export default function OAuthConsent() {
  const [params] = useSearchParams()
  const authorizationId = params.get('authorization_id') || ''
  const [details, setDetails] = useState<AuthorizationDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [approving, setApproving] = useState(false)
  const [error, setError] = useState('')

  const clientName = useMemo(
    () => details?.client_name || details?.client_metadata?.client_name || 'Shopify AI Sales Advisor Chatbot',
    [details],
  )
  const salesAdvisorClient = isSalesAdvisorClient(details, clientName)

  const approve = async () => {
    setApproving(true)
    setError('')
    try {
      const api = oauthApi()
      if (!api?.approveAuthorization) throw new Error('Supabase OAuth Server client is not available in this build.')
      const result = await api.approveAuthorization(authorizationId)
      if (result?.error) throw result.error
      const redirectUrl = redirectFromApproval(result)
      if (!redirectUrl) throw new Error('OAuth approval did not return a redirect URL.')
      window.location.href = redirectUrl
    } catch (err: any) {
      setError(err?.message || 'Unable to approve OAuth request.')
      setApproving(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    async function load() {
      setError('')
      if (!authorizationId) {
        setError('Missing OAuth authorization request.')
        setLoading(false)
        return
      }
      const { data: sessionData } = await supabase.auth.getSession()
      if (!sessionData?.session) {
        setError('This secure authorization link needs an active Cosmonet AI session. Please return to the app and sign in again.')
        setLoading(false)
        return
      }
      try {
        const api = oauthApi()
        if (!api?.getAuthorizationDetails) throw new Error('Supabase OAuth Server client is not available in this build.')
        const result = await api.getAuthorizationDetails(authorizationId)
        if (result?.error) throw result.error
        const payload = detailPayload(result)
        if (!cancelled) setDetails(payload)
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Unable to load OAuth authorization request.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [authorizationId])

  useEffect(() => {
    if (loading || error || !details || approving || !salesAdvisorClient) return
    const timer = window.setTimeout(() => {
      void approve()
    }, 300)
    return () => window.clearTimeout(timer)
  }, [loading, error, details, approving, salesAdvisorClient])

  return (
    <main className="oauth-auth-shell">
      <section className="oauth-auth-card">
        <div className="oauth-auth-brand" style={{ background: '#e8f8f4', color: '#17b89a' }}>
          <span className="oauth-auth-mark">C</span>
          <span>{salesAdvisorClient ? 'Secure workspace access' : 'Cosmonet secure access'}</span>
        </div>

        {salesAdvisorClient ? (
          <>
            <h1>Finishing your access</h1>
            <p className="oauth-auth-subtitle">
              Your account is ready. We are securely connecting your access.
            </p>
          </>
        ) : (
          <>
            <h1>Authorize access</h1>
            <p className="oauth-auth-subtitle">
              Allow <strong>{clientName}</strong> to access your Cosmonet AI account?
            </p>
          </>
        )}

        {loading ? <div className="oauth-auth-message">Loading authorization request...</div> : null}
        {!loading && error ? <div className="oauth-auth-error">{error}</div> : null}

        {!loading && !error && salesAdvisorClient ? (
          <div className="oauth-auth-message">{approving ? 'Redirecting to AI Sales Advisor...' : 'Preparing secure redirect...'}</div>
        ) : null}

        {!loading && !error && !salesAdvisorClient ? (
          <>
            {details?.scopes?.length ? (
              <div className="oauth-consent-scopes">
                <div className="field-label">Requested access</div>
                <ul>
                  {details.scopes.map((scope) => <li key={scope}>{scope}</li>)}
                </ul>
              </div>
            ) : null}
            <form className="oauth-auth-form">
              <button type="button" style={{ background: '#17b89a' }} onClick={approve} disabled={approving}>
                {approving ? 'Authorizing...' : 'Allow access'}
              </button>
            </form>
          </>
        ) : null}

        {!salesAdvisorClient && (
          <div className="oauth-auth-links">
            <Link to="/">Back to app</Link>
          </div>
        )}

        <p className="oauth-auth-footer">
          Secure account access by{' '}
          <a href="https://cosmonet.ai" target="_blank" rel="noreferrer">Cosmonet AI</a>
        </p>
      </section>
    </main>
  )
}
