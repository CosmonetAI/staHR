import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../supabase/supabaseClient'

type AuthContext = {
  user: any | null
  loading: boolean
  isClient: boolean
  client: any | null
  signIn: (email: string, password: string) => Promise<void>
  signUp: (payload: { email: string; password: string; full_name?: string }) => Promise<any>
  signOut: () => Promise<void>
}

const ctx = createContext<AuthContext>({
  user: null,
  loading: true,
  signIn: async () => {},
  signUp: async () => {},
  signOut: async () => {}
})

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [isClient, setIsClient] = useState(false)
  const [client, setClient] = useState<any | null>(null)

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data }: any) => {
      if (!mounted) return
      setUser(data.session?.user ?? null)
      setLoading(false)
    }).catch(() => {
      if (!mounted) return
      setUser(null)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event: any, session: any) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })
    // Detect recovery tokens in URL (query or hash) and restore session, then navigate to /reset
    try {
      if (typeof window !== 'undefined') {
        const searchParams = new URLSearchParams(window.location.search || '')
        const hashParams = new URLSearchParams((window.location.hash || '').replace(/^#/, ''))
        const access_token = searchParams.get('access_token') || hashParams.get('access_token')
        const refresh_token = searchParams.get('refresh_token') || hashParams.get('refresh_token')
        const type = searchParams.get('type') || hashParams.get('type')
        if (access_token) {
          // attempt to set session
          ;(async () => {
            try {
              await supabase.auth.setSession({ access_token, refresh_token } as any)
              // replace URL to /reset?recovery=1 to ensure app shows reset page
              const base = window.location.origin || ''
              const newUrl = base + '/reset?recovery=1'
              window.history.replaceState({}, '', newUrl)
              // update user state quickly
              const s = await supabase.auth.getSession()
              setUser(s?.data?.session?.user ?? null)
            } catch (e) {
              // ignore failures here; ResetPassword will attempt fallback logic
            }
          })()
        } else if (type === 'recovery') {
          // ensure user is taken to /reset
          try { const base = window.location.origin || ''; const newUrl = base + '/reset?recovery=1'; window.history.replaceState({}, '', newUrl) } catch (e) {}
        }
      }
    } catch (e) {}
    return () => {
      mounted = false
      sub?.subscription.unsubscribe()
    }
  }, [])

  const signIn = async (email: string, password: string) => {
    // Always use Supabase auth in signIn
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    // set user immediately from response when available
    const signedUser = data?.user ?? data?.session?.user ?? null
    if (signedUser) setUser(signedUser)
  }

  const signUp = async (payload: { email: string; password: string; full_name?: string }) => {
    // Local dev shortcut
    // Create auth user. Provide email redirect so confirmation returns to our app origin
    const redirectTo = (typeof window !== 'undefined' && window.location && window.location.origin) ? `${window.location.origin}/` : undefined
    const { data, error } = await supabase.auth.signUp({ email: payload.email, password: payload.password, options: { emailRedirectTo: redirectTo, data: { full_name: payload.full_name } } } as any)
    if (error) throw error

    // If a user id is returned, attempt to insert profile row into `profiles` table
    const userId = data?.user?.id
    if (userId) {
      const profile = {
        id: userId,
        email: payload.email,
        full_name: payload.full_name || null
      }
      try {
        await supabase.from('profiles').insert(profile)
      } catch (e) {
        // non-fatal: continue even if profile insert fails
        console.warn('Failed to insert profile', e)
      }
      // try to send a signup confirmation/welcome email via centralized functions/email
      try {
        const FUNCTIONS_BASE = (import.meta.env.VITE_FUNCTIONS_BASE as string) || '/functions/v1'
        const appName = (import.meta.env.VITE_APP_NAME as string) || (typeof window !== 'undefined' && window.location && window.location.hostname) || 'staHR'
        const subject = `Welcome to ${appName}`
        const html = `<p>Hi ${payload.full_name || ''},</p><p>Thanks for signing up for ${appName}. You can sign in at <a href="${redirectTo || '/'}">${redirectTo || '/'}</a>.</p>`
        const anon = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '')
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (anon) {
          headers['apikey'] = anon
          headers['Authorization'] = `Bearer ${anon}`
        }
        await fetch(`${FUNCTIONS_BASE.replace(/\/$/, '')}/email`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ type: 'notification', email: payload.email, subject, html })
        })
      } catch (e) {
        console.warn('Failed to send signup confirmation email', e)
      }
    }

    return data
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setIsClient(false)
    setClient(null)
  }

  const resetPassword = async (email: string, captchaToken?: string) => {
    const redirectTo = (typeof window !== 'undefined' && window.location && window.location.origin) ? `${window.location.origin}/reset` : undefined
    const { error } = await supabase.auth.resetPasswordForEmail(email, redirectTo ? { redirectTo } as any : undefined as any)
    return { error }
  }

  const updatePassword = async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password } as any)
    return { error }
  }

  // track whether current user corresponds to a client row (by email or by token)
  React.useEffect(() => {
    let mounted = true
    const checkClient = async () => {
      setIsClient(false)
      setClient(null)
      try {
        if (!user || !user.email) return
        const sess = await supabase.auth.getSession()
        const token = sess?.data?.session?.access_token || ''
        const FUNCTIONS_BASE = (import.meta.env.VITE_FUNCTIONS_BASE as string) || '/functions/v1'
        const res = await fetch(`${FUNCTIONS_BASE.replace(/\/$/, '')}/clients?email=${encodeURIComponent(user.email)}`, {
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
        })
        if (!mounted) return
        if (!res.ok) return
        const json = await res.json().catch(() => null)
        // expect either { data: [...] } or single object
        const data = json?.data || (Array.isArray(json) ? json : null)
        if (data && Array.isArray(data) && data.length > 0 && data[0].email === user.email) {
          setIsClient(true)
          setClient(data[0])
        } else if (json && json.email && json.email === user.email) {
          setIsClient(true)
          setClient(json)
        }
      } catch (e) {
        // ignore
      }
    }
    checkClient()
    return () => { mounted = false }
  }, [user])

  return <ctx.Provider value={{ user, loading, isClient, client, signIn, signUp, signOut, resetPassword, updatePassword }}>{children}</ctx.Provider>
}

export const useAuth = () => useContext(ctx)
