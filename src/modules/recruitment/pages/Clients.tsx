import React, { useEffect, useState } from 'react'
import { useAuth } from '../../../hooks/useAuth'
import ClientService from '../services/clientService'
import { useToast } from '../../../components/ToastProvider'

export default function ClientsPage() {
  const { user, isClient } = useAuth()
  // hide page for client users
  if (isClient) return <div className="container"><div className="card">Not found</div></div>
  const [clients, setClients] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState<any | null>(null)
  const addToast = useToast()

  useEffect(() => {
    let mounted = true
    ;(async () => {
      setLoading(true)
      try {
        const list = await ClientService.list()
        if (mounted) setClients(list || [])
      } catch (e) {
        if (mounted) setClients([])
      } finally { if (mounted) setLoading(false) }
    })()
    return () => { mounted = false }
  }, [])

  function openNew() { setEditing({ name: '', email: '', phone: '', notes: '' }) }
  function close() { setEditing(null) }

  async function save() {
    try {
      if (!editing) return
      if (!editing.name || !String(editing.name).trim()) { addToast('Name is required', 'error'); return }
      if (!editing.email || !String(editing.email).trim()) { addToast('Email is required for onboarding', 'error'); return }
      if (editing.id) {
        const updated = await ClientService.update(String(editing.id), editing)
        setClients(prev => [updated, ...prev.filter(c => String(c.id) !== String(updated.id))])
        addToast('Client updated', 'success')
      } else {
        const created = await ClientService.create(editing)
        setClients(prev => [created, ...prev])
        addToast('Client created and invitation sent', 'success')
      }
      close()
    } catch (e: any) {
      addToast('Save failed: ' + (e?.message || String(e)), 'error')
    }
  }

  async function remove(c: any) {
    if (!confirm('Delete client?')) return
    try {
      await ClientService.remove(String(c.id))
      setClients(prev => prev.filter(x => String(x.id) !== String(c.id)))
      addToast('Client deleted', 'success')
    } catch (e: any) { addToast('Delete failed: ' + (e?.message || String(e)), 'error') }
  }

  return (
    <div className="container">
      <div className="jobs-page-head">
        <h2>Clients</h2>
        <button className="btn btn-primary" onClick={openNew}>+ Onboard Client</button>
      </div>

      {loading && <div className="card">Loading…</div>}

      <div className="jobs-grid">
        {clients.map(c => (
          <div key={c.id} className="card job-card">
            <div className="job-card-head">
              <div className="job-title-block">
                <div className="job-title">{c.name}</div>
                <div className="job-meta">{c.email || ''} • {c.phone || ''}</div>
              </div>
            </div>
            <div className="job-actions">
              <button className="btn btn-ghost" onClick={() => setEditing({ ...c })}>Edit</button>
              <button className="btn btn-danger" onClick={() => remove(c)}>Delete</button>
            </div>
          </div>
        ))}
      </div>

      <div className={`overlay ${editing ? 'open' : ''}`} onClick={close} />
      <div className={`modal ${editing ? 'open' : ''}`} onClick={(e) => e.stopPropagation()}>
        {editing && (
          <div className="modal-content">
            <div className="drawer-head">
              <div>
                <h2>{editing.id ? 'Edit Client' : 'Add Client'}</h2>
                <div className="sub">Client onboarding</div>
              </div>
              <button className="drawer-close" onClick={close}>x</button>
            </div>
            <div className="drawer-body">
              <div className="field">
                <label>Client name *</label>
                <input value={editing.name || ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </div>
              <div className="field">
                <label>Email</label>
                <input value={editing.email || ''} onChange={(e) => setEditing({ ...editing, email: e.target.value })} />
              </div>
              <div className="field">
                <label>Phone</label>
                <input value={editing.phone || ''} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} />
              </div>
              <div className="field">
                <label>Notes</label>
                <textarea value={editing.notes || ''} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
              </div>
            </div>
            <div className="drawer-foot">
              <div />
              <div>
                <button className="btn btn-ghost" onClick={close}>Cancel</button>
                <button className="btn btn-primary" style={{ marginLeft: 8 }} onClick={save}>Save</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
