import React from 'react'
import FileUpload from '../../../components/FileUpload'
import { JobService } from '../services/jobService'

type Props = {
  form: any
  setForm: (f: any) => void
  importPreview: any[]
  importErrors: any[]
  handleExcelFile: (file: File) => Promise<void>
  importParsedRows: () => void
  onClearImport: () => void
  onCancel: () => void
  onSave: (updatedForm?: any) => void
  editingId: string | null
}

export default function CandidateForm({ form, setForm, importPreview, importErrors, handleExcelFile, importParsedRows, onCancel, onSave, editingId, onClearImport }: Props) {
  const STATUS_LABEL: any = { selected: 'Selected', rejected: 'Rejected', hold: 'On hold', progress: 'In progress', dropped: 'Dropped out' }
  const [errors, setErrors] = React.useState<Record<string,string>>({})
  const NOTICE_OPTIONS = ['Immediate', '15 Days', '30 Days', '60 Days', '90 Days']
  const [jobs, setJobs] = React.useState<any[]>([])
  const [newRemark, setNewRemark] = React.useState('')
  const today = new Date().toISOString().slice(0, 10)
  const TIME_SLOTS = ['09:00 AM','09:30 AM','10:00 AM','10:30 AM','11:00 AM','11:30 AM','12:00 PM','12:30 PM','01:00 PM','01:30 PM','02:00 PM','02:30 PM','03:00 PM','03:30 PM','04:00 PM','04:30 PM','05:00 PM']
  const [availabilityDate, setAvailabilityDate] = React.useState<string>(() => {
    try {
      if (form && form.availability) {
        const parts = String(form.availability).split(' ')
        if (parts[0] && /^\d{4}-\d{2}-\d{2}$/.test(parts[0])) return parts[0]
      }
    } catch (e) {}
    return ''
  })
  const [availabilitySlot, setAvailabilitySlot] = React.useState<string>(() => {
    try {
      if (form && form.availability) {
        const parts = String(form.availability).split(' ')
        if (parts.length > 1) return parts.slice(1).join(' ')
      }
    } catch (e) {}
    return ''
  })
  const [f2fDate, setF2fDate] = React.useState<string>(() => {
    try {
      if (form && form.f2f) {
        const parts = String(form.f2f).split(' ')
        if (parts[0] && /^\d{4}-\d{2}-\d{2}$/.test(parts[0])) return parts[0]
      }
    } catch (e) {}
    return ''
  })
  const [f2fSlot, setF2fSlot] = React.useState<string>(() => {
    try {
      if (form && form.f2f) {
        const parts = String(form.f2f).split(' ')
        if (parts.length > 1) return parts.slice(1).join(' ')
      }
    } catch (e) {}
    return ''
  })

  const clearError = (field: string) => {
  setErrors(prev => {
    const newErrors = { ...prev };
    delete newErrors[field];
    return newErrors;
  });
};


  React.useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const list = await JobService.list()
        if (mounted) setJobs(list || [])
      } catch (e) {
        // ignore
      }
    })()
    return () => { mounted = false }
  }, [])
  const selectedJobValue = React.useMemo(() => {
    try {
      const key = String(form.applied_job_id || '')
      if (!key) return ''
      // first try to find by friendly job_id or job_ref
      const byFriendly = jobs.find(j => String(j.job_id || j.job_ref || '').toLowerCase() === key.toLowerCase())
      if (byFriendly) return String(byFriendly.job_id || byFriendly.job_ref || byFriendly.id || '')
      // then try to find by numeric/uuid id
      const byId = jobs.find(j => String(j.id || '') === key)
      if (byId) return String(byId.job_id || byId.job_ref || byId.id || '')
      return key
    } catch (err) {
      return String(form.applied_job_id || '')
    }
  }, [form.applied_job_id, jobs])
  const validate = () => {
    const e: Record<string,string> = {}
    if (!form.name || !String(form.name).trim()) e.name = 'Candidate name is required'
    if (!form.role || !String(form.role).trim()) e.role = 'Role is required'
    if (!form.email || !String(form.email).trim()) e.email = 'Email is required'
    else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(form.email))) e.email = 'Invalid email'
    if (!form.date || !String(form.date).trim()) e.date = 'Date is required'
    else {
      try {
        const d = new Date(String(form.date))
        const todayDate = new Date(new Date().toISOString().slice(0,10))
        if (!isNaN(d.getTime()) && d < todayDate) e.date = 'Date cannot be in the past'
      } catch (err) {}
    }
    if (!form.applied_job_id || !String(form.applied_job_id).trim()) e.applied_job_id = 'Assigning to a job is required'
    // phone optional but if present must be digits
    if (form.phone) {
      const p = String(form.phone).replace(/[^0-9]/g, '')
      if (!/^[0-9]{7,15}$/.test(p)) e.phone = 'Phone should be 7-15 digits'
    }
    // CTC/ECTC should be numeric-ish (allow formats like '12 LPA')
    const moneyCheck = (val: any) => {
      if (val === null || typeof val === 'undefined' || String(val).trim() === '') return true
      const s = String(val).replace(/[,\s]/g, '')
      return !!s.match(/^-?\d+(?:\.\d+)?/)
    }
    if (!moneyCheck(form.cctc)) e.cctc = 'Current CTC looks invalid'
    if (!moneyCheck(form.ectc)) e.ectc = 'Expected CTC looks invalid'
    // notice period should be one of the allowed options or a number with 'Days'
    if (form.np) {
      const np = String(form.np).trim()
      const ok = NOTICE_OPTIONS.includes(np) || /^\d+\s*Days$/i.test(np)
      if (!ok) e.np = 'Notice period must be a valid option (e.g. 30 Days)'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSave = () => {
    if (!validate()) return
    // If there's a new remark, append it to existing remarks with timestamp
    if (newRemark && String(newRemark).trim()) {
      const ts = new Date().toISOString().slice(0, 19).replace('T', ' ')
      const existing = String(form.remarks || '')
      const appended = existing ? `${existing}\n[${ts}] ${newRemark}` : `[${ts}] ${newRemark}`
      const updatedForm = { ...form, remarks: appended }
      setForm(updatedForm)
      onSave(updatedForm)
      setNewRemark('')
    } else {
      onSave()
      setNewRemark('')
    }
  }

  React.useEffect(() => {
    // Clear the temporary newRemark whenever the editing candidate changes
    setNewRemark(''); setErrors({});
  }, [editingId])

  

  return (
    <>
      <div className="drawer-body">
        <div className="field-row">
          <div className="field">
            <label>Candidate name *</label>
            <input required value={form.name || ''} onChange={(e) => {setForm({ ...form, name: e.target.value });clearError("name");}} placeholder="e.g. Jordan Lee" />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          </div>
           {errors.name && <div style={{ color: 'var(--status-rejected)', marginTop: 6 }}>{errors.name}</div>}
          </div>
          <div className="field">
            <label>Date of submission *</label>
            <input required type="date" min={today} value={form.date || ''} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            {errors.date && <div style={{ color: 'var(--status-rejected)', marginTop: 6 }}>{errors.date}</div>}
          </div>
        </div>

            
        <div className="field-row">
          <div className="field">
              <label>Assign to job *</label>
              <select required value={selectedJobValue || ''} onChange={(e) => {
                const selected = e.target.value
                const j = jobs.find(x => String(x.job_id || x.job_ref || x.id) === String(selected))
                if (j) {setForm({ ...form, applied_job_id: String(selected), role: j.title || form.role, applied_job_title: j.title || form.applied_job_title });clearError("applied_job_id");clearError("role");}
                else setForm({ ...form, applied_job_id: '' })
              }}>
                <option value="">— select job —</option>
                {jobs.map(j => {
                  const storedId = j.job_id || j.job_ref || j.id
                  const displayId = String(storedId || '')
                  return <option key={j.id} value={displayId}>{displayId}</option>
                })}
              </select>
              {errors.applied_job_id && <div style={{ color: 'var(--status-rejected)', marginTop: 6 }}>{errors.applied_job_id}</div>}
            </div>
          <div className="field">
              <label>Role *</label>
              <input required value={form.role || ''} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="e.g. HR Generalist" />
              {errors.role && <div style={{ color: 'var(--status-rejected)', marginTop: 6 }}>{errors.role}</div>}
            </div>
          <div className="field">
            <label>Selection status</label>
            <select value={form.selstatus || 'progress'} onChange={(e) => setForm({ ...form, selstatus: e.target.value })}>
              <option value="progress">In progress</option>
              <option value="hold">On hold</option>
              <option value="selected">Selected</option>
              <option value="rejected">Rejected</option>
              <option value="dropped">Dropped out</option>
            </select>
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label>Relevant experience</label>
            <input value={form.exp || ''} onChange={(e) => setForm({ ...form, exp: e.target.value })} placeholder="e.g. 7.5 years" />
          </div>
          <div className="field">
            <label>Current CTC</label>
            <input value={form.cctc || ''} onChange={(e) => setForm({ ...form, cctc: e.target.value })} placeholder="e.g. 9.5 LPA" />
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label>Expected CTC</label>
            <input value={form.ectc || ''} onChange={(e) => setForm({ ...form, ectc: e.target.value })} placeholder="e.g. 12 LPA" />
          </div>
          <div className="field">
            <label>Email *</label>
            <input required value={form.email || ''} onChange={(e) => {setForm({ ...form, email: e.target.value });clearError("email");}} placeholder="name@email.com" />
            {errors.email && <div style={{ color: 'var(--status-rejected)', marginTop: 6 }}>{errors.email}</div>}
          </div>
          <div className="field">
            <label>Phone</label>
            <input value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="9XXXXXXXXX" />
          </div>
        </div>

        <div className="field">
          <label>LinkedIn profile</label>
          <input value={form.linkedin || ''} onChange={(e) => setForm({ ...form, linkedin: e.target.value })} placeholder="https://linkedin.com/in/…" />
        </div>

        <div className="field-row">
          <div className="field">
            <label>Current location</label>
            <input value={form.location || ''} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="e.g. City name" />
          </div>
          <div className="field">
            <label>Notice period</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select value={NOTICE_OPTIONS.includes(String(form.np)) ? String(form.np) : ''} onChange={(e) => {
                const v = e.target.value
                setForm({ ...form, np: v })
              }}>
                <option value="">— select —</option>
                {NOTICE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            {errors.np && <div style={{ color: 'var(--status-rejected)', marginTop: 6 }}>{errors.np}</div>}
          </div>
        </div>

        <div className="field">
          <label>Interview availability</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="date" min={today} value={availabilityDate || ''} onChange={(e) => {
              const d = e.target.value
              setAvailabilityDate(d)
              const combined = d && availabilitySlot ? `${d} ${availabilitySlot}` : d || ''
              setForm({ ...form, availability: combined })
            }} />
            <select value={availabilitySlot || ''} onChange={(e) => {
              const s = e.target.value
              setAvailabilitySlot(s)
              const combined = availabilityDate && s ? `${availabilityDate} ${s}` : availabilityDate || s || ''
              setForm({ ...form, availability: combined })
            }}>
              <option value="">— select slot —</option>
              {TIME_SLOTS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div className="field">
          <label>Interview status</label>
          <textarea value={form.intstatus || ''} onChange={(e) => setForm({ ...form, intstatus: e.target.value })} placeholder="e.g. 1st round conducted on 7th July"></textarea>
        </div>
        <div className="field">
          <label>Remarks (history)</label>
          <textarea
            value={form.remarks || ''}
            readOnly={!!editingId}
            onChange={(e) => {
              if (!editingId) setForm({ ...form, remarks: e.target.value })
            }}
            style={{ minHeight: 100, whiteSpace: 'pre-wrap' }}
          />
        </div>
        {editingId ? (
          <div className="field">
            <label>Add remark</label>
            <textarea value={newRemark} onChange={(e) => setNewRemark(e.target.value)} placeholder="Add a new remark (this will be appended to history)" />
          </div>
        ) : null}
        <div className="field">
          <label>F2F interview availability</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="date" min={today} value={f2fDate || ''} onChange={(e) => {
              const d = e.target.value
              setF2fDate(d)
              const combined = d && f2fSlot ? `${d} ${f2fSlot}` : d || ''
              setForm({ ...form, f2f: combined })
            }} />
            <select value={f2fSlot || ''} onChange={(e) => {
              const s = e.target.value
              setF2fSlot(s)
              const combined = f2fDate && s ? `${f2fDate} ${s}` : f2fDate || s || ''
              setForm({ ...form, f2f: combined })
            }}>
              <option value="">— select slot —</option>
              {TIME_SLOTS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div className="hint">Fields mirror the columns in the original workbook. Required fields: Candidate name, Role, Email, Date, Assign to job.</div>
      </div>
        <div className="drawer-foot">
        <div style={{ flex: 1 }} />
        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSave}>{editingId ? 'Save Candidate' : 'Save Candidate'}</button>
      </div>
    </>
  )
}
