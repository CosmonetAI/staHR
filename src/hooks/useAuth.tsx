import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../supabase/supabaseClient'

type AuthContext = {
  user: any | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const ctx = createContext<AuthContext>({
  user: null,
  loading: true,
  signIn: async () => {},
  signOut: async () => {}
})

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Development shortcut: set VITE_DEV_SKIP_AUTH=true in .env to bypass Supabase auth
    if (import.meta.env.VITE_DEV_SKIP_AUTH === 'true') {
      setUser({ id: 'dev', email: import.meta.env.VITE_DEV_USER_EMAIL || 'dev@local' })
      setLoading(false)
      return
    }

    if (import.meta.env.VITE_ALLOW_DEV_LOGIN === 'true' && localStorage.getItem('stahr_dev_login') === 'true') {
      setUser({ id: 'dev', email: import.meta.env.VITE_DEV_USER_EMAIL || 'dev@local' })
      setLoading(false)
      return
    }

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
    return () => {
      mounted = false
      sub?.subscription.unsubscribe()
    }
  }, [])

  const signIn = async (email: string, password: string) => {
    // Local dev credential shortcut when enabled in .env
    if (import.meta.env.VITE_ALLOW_DEV_LOGIN === 'true') {
      const devEmail = String(import.meta.env.VITE_DEV_USER_EMAIL || 'dev@local')
      const devPass = String(import.meta.env.VITE_DEV_USER_PASS || 'devpass')
      if (email === devEmail && password === devPass) {
        setUser({ id: 'dev', email })
        localStorage.setItem('stahr_dev_login', 'true')
        return
      }
      throw new Error('Invalid dev credentials')
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  const signOut = async () => {
    localStorage.removeItem('stahr_dev_login')
    await supabase.auth.signOut()
    setUser(null)
  }

  return <ctx.Provider value={{ user, loading, signIn, signOut }}>{children}</ctx.Provider>
}

export const useAuth = () => useContext(ctx)
