import React, { useEffect, useState } from 'react'
import { FaThLarge, FaList } from 'react-icons/fa'
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
  const [viewMode, setViewMode] = useState<'row' | 'card'>('card')
  const [search, setSearch] = useState('')
  const [openFilter, setOpenFilter] = useState<string | null>(null)
  const [hasEmail, setHasEmail] = useState<boolean | null>(null)
  const [hasPhone, setHasPhone] = useState<boolean | null>(null)
  const [hasNotes, setHasNotes] = useState<boolean | null>(null)
  const addToast = useToast()
  const [errors, setErrors] = React.useState<Record<string,string>>({})

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

  const filteredClients = React.useMemo(() => {
    let tmp = (clients || []).slice()
    if (search) {
      const s = String(search).toLowerCase()
      tmp = tmp.filter(c => String(c.name || '').toLowerCase().includes(s) || String(c.email || '').toLowerCase().includes(s) || String(c.phone || '').toLowerCase().includes(s))
    }
    if (hasEmail !== null) tmp = tmp.filter(c => Boolean(c.email) === hasEmail)
    if (hasPhone !== null) tmp = tmp.filter(c => Boolean(c.phone) === hasPhone)
    if (hasNotes !== null) tmp = tmp.filter(c => Boolean(c.notes) === hasNotes)
    return tmp
  }, [clients, search, hasEmail, hasPhone, hasNotes])

  function openNew() { setEditing({ name: '', email: '', phone: '', notes: '' }) }
  function close() { setEditing(null);setErrors({}) }

  const clearError = (field: string) => {
    setErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[field];
      return newErrors;
    });
  };

  /* async function save() {
    try {
      if (!editing) return
      if (!editing.name || !String(editing.name).trim()) 
      if (!editing.email || !String(editing.email).trim()) 
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
 */
async function save() {
  try {
    if (!editing) return;

    const newErrors: any = {};

    if (!editing.name || !String(editing.name).trim()) {
      newErrors.name = "Client name is required";
    }

    if (!editing.email || !String(editing.email).trim()) {
      newErrors.email = "Email is required";
    }

    setErrors(newErrors);

    // Stop saving if there are errors
    if (Object.keys(newErrors).length > 0) {
      return;
    }

    if (editing.id) {
      const updated = await ClientService.update(String(editing.id), editing);
      setClients(prev => [updated, ...prev.filter(c => String(c.id) !== String(updated.id))]);
      addToast("Client updated", "success");
    } else {
      const created = await ClientService.create(editing);
      setClients(prev => [created, ...prev]);
      addToast("Client created and invitation sent", "success");
    }

    close();
  } catch (e: any) {
    addToast("Save failed: " + (e?.message || String(e)), "error");
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
      <div className="jobs-page-head" style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h2>Clients</h2>
          </div>
        <div>
          <button className="btn btn-primary" onClick={openNew}>+ Onboard Client</button>
        </div>
      </div>

      <div className="toolbar candidates-toolbar" style={{ marginTop: 12, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div className="search-box" style={{ flex: '1 1 280px', minWidth: 160 }}>
          <span>🔍</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, phone…" />
        </div>
        <div className={`filter-menu ${openFilter === 'more' ? 'open' : ''}`}>
          <button type="button" className="filter-summary" onClick={() => setOpenFilter(openFilter === 'more' ? null : 'more')}>Filters</button>
          {openFilter === 'more' && (
            <div className="filter-menu-panel">
              <label className="filter-check"><input type="checkbox" checked={hasEmail === true} onChange={() => setHasEmail(prev => prev === true ? null : true)} /> <span>Has email</span></label>
              <label className="filter-check"><input type="checkbox" checked={hasPhone === true} onChange={() => setHasPhone(prev => prev === true ? null : true)} /> <span>Has phone</span></label>
              <label className="filter-check"><input type="checkbox" checked={hasNotes === true} onChange={() => setHasNotes(prev => prev === true ? null : true)} /> <span>Has notes</span></label>
              <div style={{ marginTop: 8 }}>
                <button className="btn btn-ghost" onClick={() => { setHasEmail(null); setHasPhone(null); setHasNotes(null); setOpenFilter(null) }}>Clear</button>
              </div>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button type="button" className={`icon-btn ${viewMode === 'row' ? 'active' : ''}`} onClick={() => setViewMode('row')} title="List view"><FaList /></button>
          <button type="button" className={`icon-btn ${viewMode === 'card' ? 'active' : ''}`} onClick={() => setViewMode('card')} title="Card view"><FaThLarge /></button>
        </div>
      </div>

      {loading && <div className="card">Loading…</div>}

      {viewMode === 'card' ? (
        <div className="jobs-grid">
          {filteredClients.map(c => (
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
      ) : (
        <div className="card">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '8px 12px' }}>Name</th>
                <th style={{ textAlign: 'left', padding: '8px 12px' }}>Email</th>
                <th style={{ textAlign: 'left', padding: '8px 12px' }}>Phone</th>
                <th style={{ textAlign: 'right', padding: '8px 12px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredClients.map(c => (
                <tr key={c.id}>
                  <td style={{ padding: '10px 12px' }}>{c.name}</td>
                  <td style={{ padding: '10px 12px' }}>{c.email || ''}</td>
                  <td style={{ padding: '10px 12px' }}>{c.phone || ''}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                    <button className="btn btn-ghost" onClick={() => setEditing({ ...c })}>Edit</button>
                    <button className="btn btn-danger" onClick={() => remove(c)} style={{ marginLeft: 8 }}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
                <input value={editing.name || ''} onChange={(e) => {setEditing({ ...editing, name: e.target.value }); clearError('name');}} />
                {errors.name && <div style={{ color: 'var(--status-rejected)', marginTop: 6 }}>{errors.name}</div>}
              </div>
              <div className="field">
                <label>Email *</label>
                <input value={editing.email || ''} onChange={(e) => {setEditing({ ...editing, email: e.target.value }); clearError('email');}} />
                {errors.email && <div style={{ color: 'var(--status-rejected)', marginTop: 6 }}>{errors.email}</div>}
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
