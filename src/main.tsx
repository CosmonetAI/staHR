import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import './styles/global.css'
import { ToastProvider } from './components/ToastProvider'

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
