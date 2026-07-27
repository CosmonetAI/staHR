import React from 'react'
import FileUpload from '../../../components/FileUpload'

type Props = {
  form: any
  setForm: (f: any) => void
  importPreview: any[]
  importErrors: any[]
  handleExcelFile: (file: File) => Promise<void>
  importParsedRows: () => void
  onClearImport: () => void
  onCancel: () => void
  onSave: () => void
  editingId: string | null
}

export default function CandidateForm({ form, setForm, importPreview, importErrors, handleExcelFile, importParsedRows, onCancel, onSave, editingId, onClearImport }: Props) {
  const STATUS_LABEL: any = { selected: 'Selected', rejected: 'Rejected', hold: 'On hold', progress: 'In progress', dropped: 'Dropped out' }
  const [errors, setErrors] = React.useState<Record<string,string>>({})
  const validate = () => {
    const e: Record<string,string> = {}
    if (!form.name || !String(form.name).trim()) e.name = 'Candidate name is required'
    if (!form.role || !String(form.role).trim()) e.role = 'Role is required'
    if (!form.email || !String(form.email).trim()) e.email = 'Email is required'
    else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(form.email))) e.email = 'Invalid email'
    if (!form.date || !String(form.date).trim()) e.date = 'Date is required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSave = () => {
    if (!validate()) return
    onSave()
  }

  return (
    <>
      <div className="drawer-body">
        <div className="field-row">
          <div className="field">
            <label>Candidate name</label>
            <input value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Jordan Lee" />
            {errors.name && <div style={{ color: 'var(--status-rejected)', marginTop: 6 }}>{errors.name}</div>}
          </div>
          <div className="field">
            <label>Date of submission</label>
            <input type="date" value={form.date || ''} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            {errors.date && <div style={{ color: 'var(--status-rejected)', marginTop: 6 }}>{errors.date}</div>}
          </div>
        </div>

        <div className="field-row">
          <div className="field">
              <label>Role</label>
              <input value={form.role || ''} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="e.g. HR Generalist" />
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
            <label>Email</label>
            <input value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@email.com" />
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
            <input value={form.np || ''} onChange={(e) => setForm({ ...form, np: e.target.value })} placeholder="e.g. 60 Days" />
          </div>
        </div>

        <div className="field">
          <label>Interview availability</label>
          <input value={form.availability || ''} onChange={(e) => setForm({ ...form, availability: e.target.value })} placeholder="e.g. As per schedule / date-time" />
        </div>
        <div className="field">
          <label>Interview status</label>
          <textarea value={form.intstatus || ''} onChange={(e) => setForm({ ...form, intstatus: e.target.value })} placeholder="e.g. 1st round conducted on 7th July"></textarea>
        </div>
        <div className="field">
          <label>Remarks</label>
          <textarea value={form.remarks || ''} onChange={(e) => setForm({ ...form, remarks: e.target.value })} placeholder="Internal notes / preference ranking"></textarea>
        </div>
        <div className="field">
          <label>F2F interview availability</label>
          <input value={form.f2f || ''} onChange={(e) => setForm({ ...form, f2f: e.target.value })} placeholder="e.g. 10‑July‑26 2:00–5:00 PM" />
        </div>
        <div className="hint">Fields mirror the columns in the original workbook. Required fields: Candidate name, Role, Email, Date.</div>
      </div>
        <div className="drawer-foot">
        <div style={{ flex: 1 }} />
        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSave}>{editingId ? 'Save Candidate' : 'Save Candidate'}</button>
      </div>
    </>
  )
}
