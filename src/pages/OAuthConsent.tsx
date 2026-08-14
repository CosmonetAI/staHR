import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
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

export default function OAuthConsent() {
  const navigate = useNavigate()
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
        const redirect = `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`
        navigate(`/login?redirect=${encodeURIComponent(redirect)}`, { replace: true })
        return
      }
      try {
        const api = oauthApi()
        if (!api?.getAuthorizationDetails) throw new Error('Supabase OAuth Server client is not available in this build.')
        const result = await api.getAuthorizationDetails(authorizationId)
        if (result?.error) throw result.error
        if (!cancelled) setDetails(detailPayload(result))
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
  }, [authorizationId, navigate])

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

  return (
    <div className="container">
      <div className="card login-card" style={{ maxWidth: 520, margin: '48px auto' }}>
        <h2>Authorize App</h2>
        {loading ? <p>Loading authorization request...</p> : null}
        {!loading && error ? <div className="field-error" style={{ marginBottom: 12 }}>{error}</div> : null}
        {!loading && !error ? (
          <>
            <p style={{ lineHeight: 1.5 }}>
              Allow <strong>{clientName}</strong> to access your account?
            </p>
            {details?.scopes?.length ? (
              <div style={{ marginBottom: 16 }}>
                <div className="field-label">Requested access</div>
                <ul style={{ marginTop: 8 }}>
                  {details.scopes.map((scope) => <li key={scope}>{scope}</li>)}
                </ul>
              </div>
            ) : null}
            <button type="button" className="btn btn-primary submit-btn" onClick={approve} disabled={approving}>
              {approving ? 'Authorizing...' : 'Allow'}
            </button>
          </>
        ) : null}
        <div style={{ marginTop: 12, textAlign: 'center' }}>
          <Link to="/">Back to staHR</Link>
        </div>
      </div>
    </div>
  )
}
