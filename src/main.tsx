import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import './styles/global.css'
import { ToastProvider } from './components/ToastProvider'

// Fallback pre-bootstrap stash: if the hosted index.html didn't run the
// pre-bootstrap script, attempt to stash the auth hash and recovery type
// now before the app initializes. This helps when a deployed host serves
// an older index.html but the JS bundle is updated.
try {
  if (typeof window !== 'undefined') {
    const rawHash = window.location.hash || ''
    if (rawHash && rawHash.indexOf('access_token=') !== -1) {
      const clean = rawHash.replace(/^#/, '')
      try { sessionStorage.setItem('supabase_auth_hash', clean) } catch (e) {}
      try {
        const params = new URLSearchParams(clean)
        const type = params.get('type') || ''
        const tokenType = type === 'invite' ? 'set-password' : 'reset'
        try { sessionStorage.setItem('supabase_recovery', tokenType) } catch (e) {}
        // ensure visible URL is the recovery path
        const base = window.location.origin || ''
        const recoveryPath = tokenType === 'set-password' ? '/set-password' : '/reset'
        const query = window.location.search ? `${window.location.search}&recovery=1` : '?recovery=1'
        try { window.history.replaceState({}, '', base + recoveryPath + query) } catch (e) {}
      } catch (e) {
        try { sessionStorage.setItem('supabase_recovery', 'reset') } catch (e) {}
        const query = window.location.search ? `${window.location.search}&recovery=1` : '?recovery=1'
        try { window.history.replaceState({}, '', (window.location.origin || '') + '/reset' + query) } catch (e) {}
      }
    }
  }
} catch (e) {
  console.debug('main pre-bootstrap stash failed', e)
}

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastProvider>
          <App />
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
)

// Debug: log initial location when app boots
try {
  if (typeof window !== 'undefined') {
    console.debug('App boot location', { href: window.location.href, pathname: window.location.pathname, hash: window.location.hash, search: window.location.search })
  }
} catch (e) {}
