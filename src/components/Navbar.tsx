import React, { useState, useRef, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'

export default function Navbar() {
  const { user, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current) return
      if (!ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('click', onDoc)
    return () => document.removeEventListener('click', onDoc)
  }, [])

  return (
    <div className="topbar slim-topbar" style={{ justifyContent: 'flex-end' }}>
      <div ref={ref} style={{ position: 'relative' }}>
        <button className="profile-btn" onClick={() => setOpen(s => !s)} aria-expanded={open} aria-haspopup="true">
          <div className="avatar">{(user?.email || 'U')[0].toUpperCase()}</div>
        </button>
        {open && (
          <div className="profile-menu" role="menu">
            <div className="profile-item" role="menuitem">{user?.email}</div>
            <div className="profile-item" role="menuitem" onClick={() => { signOut() }}>Logout</div>
          </div>
        )}
      </div>
    </div>
  )
}
