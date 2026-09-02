import React from 'react'
import FileUpload from '../../../components/FileUpload'
import DateTimeField from '../../../components/DateTimeField'
import { JobService } from '../services/jobService'
import { supabase } from '../../../supabase/supabaseClient'
import { useAuth } from '../../../hooks/useAuth'
import { CandidateService } from '../services/candidateService'
import { useToast } from '../../../components/ToastProvider'
import { LookupService } from '../services/lookupService'

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
  const { isClient } = useAuth()
  const STATUS_LABEL: any = { selected: 'Selected', rejected: 'Rejected', hold: 'On hold', progress: 'In progress', dropped: 'Dropped out' }
  const [errors, setErrors] = React.useState<Record<string,string>>({})
  const NOTICE_OPTIONS = ['Immediate', '15 Days', '30 Days', '60 Days', '90 Days']
  const [jobs, setJobs] = React.useState<any[]>([])
  const [newRemark, setNewRemark] = React.useState('')
  const today = new Date().toISOString().slice(0, 10)
  const TIME_SLOTS = ['09:00 AM','09:30 AM','10:00 AM','10:30 AM','11:00 AM','11:30 AM','12:00 PM','12:30 PM','01:00 PM','01:30 PM','02:00 PM','02:30 PM','03:00 PM','03:30 PM','04:00 PM','04:30 PM','05:00 PM']
  const [confirmedAvailability, setConfirmedAvailability] = React.useState<string>(() => String(form.confirmed_availability || ''))
  const [resumeFile, setResumeFile] = React.useState<File | null>(null)
  const [resumeUploading, setResumeUploading] = React.useState(false)
  const [resumeUrl, setResumeUrl] = React.useState<string>(() => String(form.resume_url || form.resume || ''))
  const [newClientFeedback, setNewClientFeedback] = React.useState('')
  const addToast = useToast()
  const [profileSourcingOptions, setProfileSourcingOptions] = React.useState<any[]>([])
  const [consultantOptions, setConsultantOptions] = React.useState<any[]>([])

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

  React.useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const ps = await LookupService.listProfileSourcing()
        const cs = await LookupService.listConsultants()
        if (!mounted) return
        setProfileSourcingOptions(ps || [])
        setConsultantOptions(cs || [])
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
      const byFriendly = jobs.find(j => String(j.job_id || j.job_ref || '').toLowerCase() === key.toLowerCase())
      if (byFriendly) return String(byFriendly.job_id || byFriendly.job_ref || byFriendly.id || '')
      const byId = jobs.find(j => String(j.id || '') === key)
      if (byId) return String(byId.job_id || byId.job_ref || byId.id || '')
      return key
    } catch (err) {
      return String(form.applied_job_id || '')
    }
  }, [form.applied_job_id, jobs])

  const [jobQuery, setJobQuery] = React.useState<string>('')
  const [showJobDropdown, setShowJobDropdown] = React.useState(false)

  React.useEffect(() => {
    try {
      const key = String(form.applied_job_id || '')
      if (!key) { setJobQuery(''); return }
      const byFriendly = jobs.find(j => String(j.job_id || j.job_ref || '').toLowerCase() === key.toLowerCase())
      if (byFriendly) { setJobQuery(`${String(byFriendly.title || '').trim()} — ${String(byFriendly.job_id || byFriendly.job_ref || byFriendly.id || '')}`); return }
      const byId = jobs.find(j => String(j.id || '') === key)
      if (byId) { setJobQuery(`${String(byId.title || '').trim()} — ${String(byId.job_id || byId.job_ref || byId.id || '')}`); return }
      setJobQuery(key)
    } catch (e) { setJobQuery(String(form.applied_job_id || '')) }
  }, [form.applied_job_id, jobs])

  const validate = () => {
    const e: Record<string,string> = {}
    if (!form.name || !String(form.name).trim()) e.name = 'Candidate name is required'
    if (!form.role || !String(form.role).trim()) e.role = 'Role is required'
    if (!form.email || !String(form.email).trim()) e.email = 'Email is required'
    else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(form.email))) e.email = 'Invalid email'
    if (!form.date || !String(form.date).trim()) e.date = 'Date is required'
    if (!form.applied_job_id || !String(form.applied_job_id).trim()) e.applied_job_id = 'Assigning to a job is required'
    // Profile Sourcing is optional. Consultant is required only when Profile Sourcing is Consultant.
    if ((String(form.profile_sourcing || '').toLowerCase() === 'consultant' || String(profileSourcingOptions.find(p=>p.id===form.profile_sourcing_id)?.name || '').toLowerCase() === 'consultant') && (!form.consultant_id && !form.consultant)) e.consultant = 'Consultant is required when Profile Sourcing is Consultant'
    if (form.phone) {
      const p = String(form.phone).replace(/[^0-9]/g, '')
      if (!/^[0-9]{7,15}$/.test(p)) e.phone = 'Phone should be 7-15 digits'
    }
    const moneyCheck = (val: any) => {
      if (val === null || typeof val === 'undefined' || String(val).trim() === '') return true
      const s = String(val).replace(/[,\s]/g, '')
      return !!s.match(/^-?\d+(?:\.\d+)?/)
    }
    if (!moneyCheck(form.cctc)) e.cctc = 'Current CTC looks invalid'
    if (!moneyCheck(form.ectc)) e.ectc = 'Expected CTC looks invalid'
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
    if (newRemark && String(newRemark).trim()) {
      const getISTTimestamp = (d = new Date()) => {
        try {
          const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(d)
          const y = parts.find(p => p.type === 'year')?.value || ''
          const mm = parts.find(p => p.type === 'month')?.value || ''
          const dd = parts.find(p => p.type === 'day')?.value || ''
          const hh = parts.find(p => p.type === 'hour')?.value || '00'
          const min = parts.find(p => p.type === 'minute')?.value || '00'
          const ss = parts.find(p => p.type === 'second')?.value || '00'
          return `${y}-${mm}-${dd} ${hh}:${min}:${ss}`
        } catch (e) {
          return new Date().toISOString().slice(0, 19).replace('T', ' ')
        }
      }
      const ts = getISTTimestamp()
      const existing = String(form.remarks || '')
      const appended = existing ? `${existing}\n[${ts}] ${newRemark}` : `[${ts}] ${newRemark}`
      const updatedForm = { ...form, remarks: appended }
      setForm(updatedForm)
      onSave(updatedForm)
      setNewRemark('')
    } else {
      const combinedInterviewSlot = form.interview_slot || ''
      const doSave = async () => {
        let updatedForm: any = { ...form, interview_slot: combinedInterviewSlot, confirmed_availability: confirmedAvailability }
        if (resumeFile) {
          try {
            setResumeUploading(true)
            const bucket = String(import.meta.env.VITE_RESUME_BUCKET || 'resumes')
            const filePath = `resumes/${Date.now()}_${resumeFile.name.replace(/[^a-zA-Z0-9_.-]/g, '_')}`
            const { error: uploadError } = await supabase.storage.from(bucket).upload(filePath, resumeFile, { upsert: true })
            if (uploadError) throw uploadError
            try {
              const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(filePath)
              if (publicData && (publicData.publicUrl || publicData.publicURL || publicData.public_url)) {
                const publicUrl = publicData.publicUrl || publicData.publicURL || publicData.public_url
                updatedForm = { ...updatedForm, resume_url: publicUrl }
                setResumeUrl(publicUrl)
              } else {
                updatedForm = { ...updatedForm, resume_path: filePath }
              }
            } catch (err) {
              updatedForm = { ...updatedForm, resume_path: filePath }
            }
          } catch (err: any) {
            console.error('Resume upload failed', err)
            setResumeUploading(false)
            return
          } finally {
            setResumeUploading(false)
          }
        }

        // Ensure consultant fields are only present when profile sourcing is Consultant
        try {
          const psName = String(updatedForm.profile_sourcing || profileSourcingOptions.find(p=>p.id===updatedForm.profile_sourcing_id)?.name || '').toLowerCase()
          if (psName !== 'consultant') {
            updatedForm.consultant = null
            updatedForm.consultant_id = null
          }
        } catch (e) {}
        setForm(updatedForm)
        onSave(updatedForm)
        setNewRemark('')
      }
      void doSave()
    }
  }

  React.useEffect(() => {
    setNewRemark(''); setErrors({});
  }, [editingId])

  React.useEffect(() => {
    setResumeUrl(String(form.resume_url || form.resume || ''))
  }, [editingId, form.resume_url, form.resume])

  React.useEffect(() => {
    setConfirmedAvailability(String(form.confirmed_availability || ''))
  }, [form.confirmed_availability])

  return (
    <>
      <div className="drawer-body">
        <div className="field-row">
          <div className="field">
            <label>Candidate name *</label>
            <input required value={form.name || ''} onChange={(e) => {setForm({ ...form, name: e.target.value });clearError("name");}} placeholder="e.g. Jordan Lee" />
            {errors.name && <div style={{ color: 'var(--status-rejected)', marginTop: 6 }}>{errors.name}</div>}
          </div>
          <div className="field">
            <DateTimeField label="Date of submission" value={form.date || ''} onChange={(iso) => setForm({ ...form, date: iso || '' })} required error={!!errors.date} helperText={errors.date} dateOnly={true} enforceIST={true} />
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label>Assign to job *</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {/* <input placeholder="Job Id (e.g. job-19)" value={String(form.applied_job_id || '')} onChange={(e) => {
                const val = e.target.value
                setForm({ ...form, applied_job_id: val })
                const found = jobs.find(x => String(x.job_id || x.job_ref || x.id).toLowerCase() === String(val).toLowerCase())
                if (found) setForm(prev => ({ ...prev, role: found.title || prev.role, applied_job_title: found.title || prev.applied_job_title }))
              }} style={{ flex: 1 }} /> */}

              <div style={{ position: 'relative' }}>
                <input
                  required
                  value={jobQuery}
                  onChange={(e) => { setJobQuery(e.target.value); setShowJobDropdown(true) }}
                  onFocus={() => setShowJobDropdown(true)}
                  onBlur={() => setTimeout(() => setShowJobDropdown(false), 150)}
                  placeholder="Search job by title or id..."
                  style={{ width: 260, padding: '8px 10px' }}
                />
                {showJobDropdown && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--paper-raised)', border: '1px solid var(--line)', borderRadius: 6, maxHeight: 220, overflow: 'auto', zIndex: 40 }}>
                    <div style={{ padding: 8 }}>
                      {jobs.filter(j => {
                        const label = `${String(j.title || '').toLowerCase()} ${String(j.job_id || j.job_ref || j.id || '').toLowerCase()}`
                        return label.includes(String(jobQuery || '').toLowerCase())
                      }).map(j => {
                        const storedId = j.job_id || j.job_ref || j.id
                        const displayId = String(storedId || '')
                        const title = String(j.title || '').trim()
                        const label = title ? `${title} — ${displayId}` : displayId
                        return (
                          <div key={j.id} style={{ padding: '6px 8px', cursor: 'pointer' }} onMouseDown={(ev) => { ev.preventDefault(); setForm({ ...form, applied_job_id: String(displayId), role: j.title || form.role, applied_job_title: j.title || form.applied_job_title }); clearError('applied_job_id'); clearError('role'); setJobQuery(label); setShowJobDropdown(false); }}>
                            {label}
                          </div>
                        )
                      })}
                      {jobs.filter(j => {
                        const label = `${String(j.title || '').toLowerCase()} ${String(j.job_id || j.job_ref || j.id || '').toLowerCase()}`
                        return label.includes(String(jobQuery || '').toLowerCase())
                      }).length === 0 && (
                        <div style={{ padding: '8px', color: '#64748b' }}>No jobs match</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
            {errors.applied_job_id && <div style={{ color: 'var(--status-rejected)', marginTop: 6 }}>{errors.applied_job_id}</div>}
          </div>

          <div className="field">
            <label>Role *</label>
            <input required value={form.role || ''} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="e.g. HR Generalist" />
            {errors.role && <div style={{ color: 'var(--status-rejected)', marginTop: 6 }}>{errors.role}</div>}
          </div>

          <div className="field">
            <label>Selection status</label>
            <select value={form.selstatus || ''} onChange={(e) => setForm({ ...form, selstatus: e.target.value })}>
              <option value="">— select —</option>
              <option value="Pre-screening in-progress">Pre-screening in-progress</option>
              <option value="Pre-screening done and submitted for evaluation">Pre-screening done and submitted for evaluation</option>
              <option value="Evaluation in-progress">Evaluation in-progress</option>
              <option value="Evaluation done and submitted for sharing with client">Evaluation done and submitted for sharing with client</option>
              <option value="Profile shared with client">Profile shared with client</option>
              <option value="Scheduled for L1 discussion">Scheduled for L1 discussion</option>
              <option value="Scheduled for L2 discussion">Scheduled for L2 discussion</option>
              <option value="Scheduled for L3 discussion">Scheduled for L3 discussion</option>
              <option value="Candidate shortlisted">Candidate shortlisted</option>
              <option value="On hold">On hold</option>
              <option value="Rejected">Rejected</option>
              <option value="Dropped Out">Dropped Out</option>
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
            <label>Profile Sourcing</label>
            <select value={form.profile_sourcing_id || form.profile_sourcing || ''} onChange={(e) => {
              const val = e.target.value
              const found = profileSourcingOptions.find(p => String(p.id) === val) || profileSourcingOptions.find(p => String(p.name) === val)
              if (found) setForm({ ...form, profile_sourcing_id: found.id, profile_sourcing: found.name })
              else setForm({ ...form, profile_sourcing_id: '', profile_sourcing: '' })
              clearError('profile_sourcing')
            }}>
              <option value="">— select —</option>
              {profileSourcingOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {errors.profile_sourcing && <div style={{ color: 'var(--status-rejected)', marginTop: 6 }}>{errors.profile_sourcing}</div>}
          </div>

          <div className="field" style={{ display: (String(form.profile_sourcing || '').toLowerCase() === 'consultant' || String(profileSourcingOptions.find(p=>p.id===form.profile_sourcing_id)?.name || '').toLowerCase() === 'consultant') ? 'block' : 'none' }}>
            <label>Consultant {String(form.profile_sourcing || '').toLowerCase() === 'consultant' ? '*' : ''}</label>
            <select value={form.consultant_id || form.consultant || ''} onChange={(e) => {
              const val = e.target.value
              const found = consultantOptions.find(c => String(c.id) === val) || consultantOptions.find(c => String(c.name) === val)
              if (found) setForm({ ...form, consultant_id: found.id, consultant: found.name })
              else setForm({ ...form, consultant_id: '', consultant: '' })
              clearError('consultant')
            }}>
              <option value="">— select —</option>
              {consultantOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {errors.consultant && <div style={{ color: 'var(--status-rejected)', marginTop: 6 }}>{errors.consultant}</div>}
          </div>
        </div>

        <div className="field">
          <label>Resume (PDF / DOC / DOCX)</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="file" accept=".pdf,.doc,.docx" onChange={(e) => { if (e.target.files && e.target.files[0]) setResumeFile(e.target.files[0]) }} />
            {resumeUploading && <span style={{ fontSize: 13 }}>Uploading...</span>}
            {!resumeUploading && (resumeUrl || form.resume_path) && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    let urlToFetch = resumeUrl || ''
                    if (!urlToFetch && form.resume_path) {
                      try {
                        const parts = String(form.resume_path || '').split('/')
                        const bucket = parts[0]
                        const path = parts.slice(1).join('/')
                        if (bucket && path) {
                          const publicData = await supabase.storage.from(bucket).getPublicUrl(path)
                          urlToFetch = publicData?.data?.publicUrl || publicData?.data?.publicURL || publicData?.data?.public_url || ''
                        }
                      } catch (e) { /* ignore */ }
                    }
                    if (!urlToFetch) throw new Error('No resume URL available')
                    const resp = await fetch(urlToFetch)
                    if (!resp.ok) throw new Error('Failed to fetch resume')
                    const blob = await resp.blob()
                    const url = URL.createObjectURL(blob)
                    const parts = (urlToFetch || '').split('/')
                    const name = parts[parts.length - 1] || `resume_${Date.now()}`
                    const a = document.createElement('a')
                    a.href = url
                    a.download = name
                    document.body.appendChild(a)
                    a.click()
                    a.remove()
                    window.open(url, '_blank')
                    setTimeout(() => URL.revokeObjectURL(url), 60 * 1000)
                  } catch (e) {
                    console.error('Failed to download/view resume', e)
                    alert('Failed to download or view resume')
                  }
                }}
                style={{ fontSize: 13, background: 'none', border: 'none', color: 'var(--primary)', textDecoration: 'underline', cursor: 'pointer' }}
              >
                View / Download
              </button>
            )}
          </div>
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

          {/* <div className="field">
            <DateTimeField label="Interview availability" value={form.availability || ''} onChange={(iso) => setForm({ ...form, availability: iso || '' })} disablePast required={false} enforceIST={true} />
          </div> */}

        <div className="field-row wide-dates">
          <div className="field">
            <DateTimeField label="Interview slot given by client" value={form.interview_slot || ''} onChange={(iso) => setForm({ ...form, interview_slot: iso || '' })} disablePast enforceIST={true} />
          </div>
          <div className="field">
            <label>Candidates confirmed availability</label>
            <DateTimeField  value={String(form.confirmed_availability || '')} onChange={(iso) => { setForm({ ...form, confirmed_availability: iso || '' }); setConfirmedAvailability(String(iso || '')) }} enforceIST={true} />
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
          <label>Client feedback</label>
          {isClient ? (
            form.client_feedback && String(form.client_feedback).trim() ? (
              <>
                <textarea value={form.client_feedback || ''} readOnly style={{ background: 'var(--bg)', color: 'var(--text)', minHeight: 100 }} />
                <div style={{ marginTop: 8 }} />
                <label>Add client feedback</label>
                <textarea value={newClientFeedback} onChange={(e) => setNewClientFeedback(e.target.value)} placeholder="Add new feedback to append" style={{ minHeight: 80 }} />
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button className="btn btn-ghost" onClick={() => setNewClientFeedback('')}>Reset</button>
                  <button className="btn btn-primary" onClick={async () => {
                    if (!editingId) {
                      addToast('Cannot append feedback: not editing candidate', 'error')
                      return
                    }
                    const text = String(newClientFeedback || '').trim()
                    if (!text) { addToast('Enter feedback to append', 'info'); return }
                    try {
                      const updated = await CandidateService.update(String(editingId), { append_client_feedback: text })
                      if (updated) {
                        setForm(updated)
                        setNewClientFeedback('')
                        addToast('Client feedback appended', 'success')
                      }
                    } catch (e) {
                      console.error('Failed to append feedback', e)
                      addToast('Failed to append feedback', 'error')
                    }
                  }}>Append feedback</button>
                </div>
              </>
            ) : (
              <textarea value={form.client_feedback || ''} onChange={(e) => setForm({ ...form, client_feedback: e.target.value })} placeholder="Enter feedback for the client" />
            )
          ) : (
            <textarea value={form.client_feedback || ''} readOnly style={{ background: 'var(--bg)', color: 'var(--text)' }} />
          )}
        </div>

        <div className="field">
          <DateTimeField label="F2F interview availability" value={form.f2f || ''} onChange={(iso) => setForm({ ...form, f2f: iso || '' })} enforceIST={true} />
        </div>

        <div className="hint">Fields mirror the columns in the original workbook. Required fields: Candidate name, Role, Email, Date, Assign to job.</div>
      </div>

      <div className="drawer-foot">
        <div style={{ flex: 1 }} />
        <button className="btn btn-ghost" onClick={() => { onCancel(); setErrors({}); }}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSave}>{editingId ? 'Save Candidate' : 'Save Candidate'}</button>
      </div>
    </>
  )
}
