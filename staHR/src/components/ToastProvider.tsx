import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'

type ToastType = 'success' | 'error' | 'info'
type ToastItem = { id: string; message: string; type: ToastType }

const ToastContext = createContext<(message: string, type?: ToastType, duration?: number) => void>(() => {})

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const addToast = useCallback((message: string, type: ToastType = 'info', duration = 3000) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    const t: ToastItem = { id, message, type }
    setToasts((s) => [...s, t])
    setTimeout(() => setToasts((s) => s.filter(x => x.id !== id)), duration)
  }, [])

  return (
    <ToastContext.Provider value={addToast}>
      {children}
      <div style={{ position: 'fixed', right: 20, bottom: 24, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`} style={{ minWidth: 360, maxWidth: 560, padding: '14px 18px', borderRadius: 12, minHeight: 64, display: 'flex', flexDirection: 'column', justifyContent: 'center', boxShadow: '0 10px 30px rgba(13,38,59,0.12)', color: '#0f172a', background: t.type === 'success' ? '#ECFDF5' : t.type === 'error' ? '#FEF2F2' : '#EFF6FF', border: '1px solid rgba(2,6,23,0.04)' }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{t.type === 'success' ? 'Success' : t.type === 'error' ? 'Error' : 'Info'}</div>
            <div style={{ marginTop: 6, fontSize: 14 }}>{t.message}</div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
