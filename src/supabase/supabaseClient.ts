import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = String(import.meta.env.VITE_SUPABASE_URL || '')
const SUPABASE_ANON_KEY = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '')

function makeStub() {
	return {
		auth: {
			getSession: async () => ({ data: { session: null } }),
			onAuthStateChange: (_cb: any) => ({ data: { subscription: { unsubscribe: () => {} } } }),
			signInWithPassword: async (_: any) => ({ error: new Error('Supabase not configured') }),
			signOut: async () => ({ error: new Error('Supabase not configured') })
		},
		from: (_: string) => ({
			insert: async () => ({ data: null, error: new Error('Supabase not configured') }),
			select: async () => ({ data: null, error: new Error('Supabase not configured') }),
			update: async () => ({ data: null, error: new Error('Supabase not configured') }),
			delete: async () => ({ data: null, error: new Error('Supabase not configured') })
		})
	}
}

export const supabase: any = SUPABASE_URL && SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
	auth: {
		persistSession: true,
		autoRefreshToken: true,
		detectSessionInUrl: true,
		storage: window.localStorage
	}
}) : makeStub()
