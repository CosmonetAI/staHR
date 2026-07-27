import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useToast } from '../../../components/ToastProvider'
import { CandidateService } from '../services/candidateService'
import { JobService } from '../services/jobService'

export default function JobsPage() {
  const navigate = useNavigate()
  const { data: candidatesData } = useQuery(['candidates'], () => CandidateService.list(1, 1000))
  const [jobs, setJobs] = useState<any[]>([])
  const [loadingJobs, setLoadingJobs] = useState(false)
  const [jobErrors, setJobErrors] = useState<Record<string,string>>({})

  useEffect(() => {
    let mounted = true
    ;(async () => {
      setLoadingJobs(true)
      try {
        const list = await JobService.list()
        if (mounted) setJobs(list || [])
      } catch (e) {
        if (mounted) setJobs([])
      } finally {
        if (mounted) setLoadingJobs(false)
      }
    })()
    return () => { mounted = false }
  }, [])
  const [selectedJob, setSelectedJob] = useState<any | null>(null)
  const [newJob, setNewJob] = useState<any | null>(null)
  const [applications, setApplications] = useState<any[]>([])
  const addToast = useToast()
  const candidates = candidatesData?.data || []

  function normalizeRole(value: any) {
    return String(value || '').trim().toLowerCase()
  }

  function applicationCount(job: any) {
    const role = normalizeRole(job.title)
    const importedCount = candidates.filter((c: any) => normalizeRole(c.role || c.job_role) === role).length
    const localCount = applications.filter((a: any) => a.jobId === job.id).length
    return importedCount + localCount
  }

  function openDetails(job: any) {
    setSelectedJob(job)
  }

  function closeDetails() {
    setSelectedJob(null)
  }



  function openNewJob() {
    const today = new Date().toISOString().slice(0, 10)
    setNewJob({ title: '', location: '', openings: 1, posted: today, status: 'Open', desc: '' })
  }

  function validateJob(j: any) {
    const e: Record<string,string> = {}
    if (!j) return { valid: false, errors: e }
    if (!j.title || !String(j.title).trim()) e.title = 'Job title is required'
    if (!j.location || !String(j.location).trim()) e.location = 'Location is required'
    const openings = Number(j.openings)
    if (!Number.isFinite(openings) || openings <= 0) e.openings = 'Openings must be a positive number'
    // posted date
    if (!j.posted || isNaN(Date.parse(String(j.posted)))) e.posted = 'Invalid posted date'
    return { valid: Object.keys(e).length === 0, errors: e }
  }

  function closeNewJob() {
    setNewJob(null)
  }

  async function createJob() {
    if (!newJob) return
    const res = validateJob(newJob)
    setJobErrors(res.errors)
    if (!res.valid) {
      addToast('Fix validation errors in job form', 'error', 2000)
      return
    }
    try {
      if (newJob.id) {
        const updated = await JobService.update(String(newJob.id), newJob)
        setJobs(prev => [updated, ...prev.filter((j: any) => String(j.id) !== String(newJob.id))])
        addToast('Job updated', 'success', 2000)
      } else {
        const created = await JobService.create(newJob)
        setJobs(prev => [created, ...prev])
        addToast('Job added', 'success', 2000)
      }
      closeNewJob()
    } catch (e: any) {
      addToast('Failed to save job: ' + (e?.message || String(e)), 'error')
    }
  }

  async function deleteJob(job: any) {
    if (!confirm('Delete this job?')) return
    try {
      await JobService.remove(String(job.id))
      setJobs(prev => prev.filter(j => String(j.id) !== String(job.id)))
      addToast('Job deleted', 'success')
    } catch (e: any) {
      addToast('Delete failed: ' + (e?.message || String(e)), 'error')
    }
  }

  

  return (
    <div className="container">
      <div className="jobs-page-head">
        <h2>Jobs</h2>
        <button className="btn btn-primary" onClick={openNewJob}>+ Add Job</button>
      </div>

      <div className="jobs-grid">
        {loadingJobs && <div className="card">Loading jobs…</div>}
        {jobs.map(job => {
          const apps = applicationCount(job)

          return (
            <div key={job.id} className="card job-card" onClick={() => openDetails(job)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') openDetails(job) }}>
              <div className="job-card-head">
                <div className="job-title-block">
                  <button className="job-title" onClick={() => openDetails(job)}>{job.title}</button>
                  <div className="job-meta">{job.location} • JOB ID: {String(job.job_id || job.job_ref || job.id || '')} • Posted {job.posted}</div>
                </div>
                <div className={`badge ${job.status === 'Open' ? 'progress' : 'dropped'}`}>{job.status}</div>
              </div>

              <div className="job-metrics" aria-label={`${job.openings} openings and ${apps} applications`}>
                <div className="job-metric">
                  <div className="job-metric-value">{job.openings}</div>
                  <div className="job-metric-label">Opening{job.openings === 1 ? '' : 's'}</div>
                </div>
                <div className="job-metric">
                  <div className="job-metric-value">{apps}</div>
                  <div className="job-metric-label">Application{apps === 1 ? '' : 's'}</div>
                </div>
              </div>

              <div className="job-actions">
                {job.status !== 'Closed' && (
                  <button className="btn btn-ghost" onClick={(e) => { e.stopPropagation(); navigate('/candidates?job_ref=' + encodeURIComponent(job.job_id || job.job_ref || job.id) + '&job_title=' + encodeURIComponent(job.title)) }}>Apply</button>
                )}
                <button className="btn btn-primary" onClick={(e) => { e.stopPropagation(); navigate('/candidates?role=' + encodeURIComponent(job.title)) }}>View candidates</button>
                <button className="btn btn-ghost" onClick={(e) => { e.stopPropagation(); openDetails(job) }}>Details</button>
                <button className="btn btn-ghost" onClick={(e) => { e.stopPropagation(); setNewJob({ ...job }) }}>Edit</button>
                <button className="btn btn-danger" onClick={(e) => { e.stopPropagation(); deleteJob(job) }}>Delete</button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Toasts rendered by ToastProvider */}

      {/* Details modal */}
      <div className={`overlay ${selectedJob ? 'open' : ''}`} onClick={closeDetails} />
      <div className={`modal ${selectedJob ? 'open' : ''}`} onClick={(e) => e.stopPropagation()}>
        {selectedJob && (
          <div className="modal-content">
            <div className="drawer-head">
              <div>
                <h2>{selectedJob.title}</h2>
                <div className="sub" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <span>City: {selectedJob.city || selectedJob.location || '-'}</span>
                  <span>Posted date: {selectedJob.posted || '-'}</span>
                  <span>JOB ID: {String(selectedJob.job_id || selectedJob.job_ref || selectedJob.id || '')}</span>
                  {selectedJob.status === 'Closed' && (
                    <span>Closed date: {selectedJob.closed_date || selectedJob.closed_at || selectedJob.updated_at || '-'}</span>
                  )}
                </div>
              </div>
              <button className="drawer-close" onClick={closeDetails}>✕</button>
            </div>

            <div className="drawer-body">
              <div style={{ marginBottom: 12 }}>
                <h3>Summary:</h3>
                <p style={{ whiteSpace: 'pre-wrap' }}>{selectedJob.summary || selectedJob.description || selectedJob.desc || '-'}</p>
              </div>

              <div style={{ marginTop: 8 }}>
                <h3>Job Description:</h3>
                <div style={{ whiteSpace: 'pre-wrap', marginBottom: 12 }}>{selectedJob.job_description || selectedJob.description || selectedJob.desc || '-'}</div>

                { (selectedJob.technical_skills && Array.isArray(selectedJob.technical_skills)) || selectedJob.technical_skills ? (
                  <div style={{ marginBottom: 12 }}>
                    <h4>Required Skills:</h4>
                    <ul>
                      {(Array.isArray(selectedJob.technical_skills) ? selectedJob.technical_skills : String(selectedJob.technical_skills).split(/[,\n]+/)).filter(Boolean).map((s: any, i: number) => <li key={i}>{String(s).trim()}</li>)}
                    </ul>
                  </div>
                ) : null }

                { (selectedJob.responsibilities || '').trim() ? (
                  <div style={{ marginBottom: 12 }}>
                    <h4>Key Responsibilities:</h4>
                    <ul>
                      {String(selectedJob.responsibilities).split(/\n+/).filter(Boolean).map((r: any, i: number) => <li key={i}>{r}</li>)}
                    </ul>
                  </div>
                ) : null }

                <div className="job-detail-metrics" style={{ marginTop: 6 }}>
                  <div className="job-metric">
                    <div className="job-metric-value">{selectedJob.openings}</div>
                    <div className="job-metric-label">Opening{selectedJob.openings === 1 ? '' : 's'}</div>
                  </div>
                  <div className="job-metric">
                    <div className="job-metric-value">{applicationCount(selectedJob)}</div>
                    <div className="job-metric-label">Application{applicationCount(selectedJob) === 1 ? '' : 's'}</div>
                  </div>
                </div>

                <p style={{ marginTop: 8 }}><strong>Status:</strong> <span className={`badge ${selectedJob.status === 'Open' ? 'progress' : 'dropped'}`}>{selectedJob.status}</span></p>
              </div>
            </div>

            <div style={{ marginTop: 8 }} className="hint">Required fields: Job title, Location, Openings.</div>
            <div className="drawer-foot">
              <div />
              <div>
                <button className="btn btn-ghost" onClick={closeDetails}>Close</button>
                {selectedJob.status !== 'Closed' ? (
                  <button className="btn btn-primary" style={{ marginLeft: 8 }} onClick={() => { closeDetails(); navigate('/candidates?job_ref=' + encodeURIComponent(selectedJob.job_id || selectedJob.job_ref || selectedJob.id) + '&job_title=' + encodeURIComponent(selectedJob.title)) }}>Apply</button>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </div>


      {/* Add job modal */}
      <div className={`overlay ${newJob ? 'open' : ''}`} onClick={closeNewJob} />
      <div className={`modal ${newJob ? 'open' : ''}`} onClick={(e) => e.stopPropagation()}>
        {newJob && (
          <div className="modal-content">
            <div className="drawer-head">
              <div>
                <h2>Add Job</h2>
                <div className="sub">Create a basic job listing</div>
              </div>
              <button className="drawer-close" onClick={closeNewJob}>x</button>
            </div>
            <div className="drawer-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                <div className="field-row">
                <div className="field">
                  <label>Job title *</label>
                  <input required placeholder="e.g. Software Engineer" value={newJob.title} onChange={(e) => setNewJob({ ...newJob, title: e.target.value })} />
                  {jobErrors.title && <div style={{ color: 'var(--status-rejected)', marginTop: 6 }}>{jobErrors.title}</div>}
                </div>
                <div className="field">
                  <label>Location *</label>
                  <input required placeholder="e.g. Bengaluru, India" value={newJob.location} onChange={(e) => setNewJob({ ...newJob, location: e.target.value })} />
                  {jobErrors.location && <div style={{ color: 'var(--status-rejected)', marginTop: 6 }}>{jobErrors.location}</div>}
                </div>
              </div>
              <div className="field-row">
                <div className="field">
                  <label>Department</label>
                  <input placeholder="e.g. Engineering" value={newJob.department || ''} onChange={(e) => setNewJob({ ...newJob, department: e.target.value })} />
                </div>
              </div>
              <div className="field-row">
                <div className="field">
                  <label>Employment type</label>
                  <select value={newJob.employment_type || ''} onChange={(e) => setNewJob({ ...newJob, employment_type: e.target.value })}>
                    <option value="">— select —</option>
                    <option value="Full-Time">Full-Time</option>
                    <option value="Part-Time">Part-Time</option>
                    <option value="Contract">Contract</option>
                    <option value="Internship">Internship</option>
                  </select>
                </div>
                <div className="field">
                  <label>Work mode</label>
                  <select value={newJob.work_mode || ''} onChange={(e) => setNewJob({ ...newJob, work_mode: e.target.value })}>
                    <option value="">— select —</option>
                    <option value="Onsite">Onsite</option>
                    <option value="Hybrid">Hybrid</option>
                    <option value="Remote">Remote</option>
                  </select>
                </div>
              </div>
              <div className="field-row">
                <div className="field">
                  <label>Experience (min)</label>
                  <input placeholder="Min years (e.g. 2)" type="number" min="0" value={newJob.experience_min || ''} onChange={(e) => setNewJob({ ...newJob, experience_min: Number(e.target.value) || null })} />
                </div>
                <div className="field">
                  <label>Experience (max)</label>
                  <input placeholder="Max years (e.g. 5)" type="number" min="0" value={newJob.experience_max || ''} onChange={(e) => setNewJob({ ...newJob, experience_max: Number(e.target.value) || null })} />
                </div>
              </div>
              <div className="field-row">
                <div className="field">
                  <label>Openings *</label>
                  <input required placeholder="Number of openings" type="number" min="1" value={newJob.openings} onChange={(e) => setNewJob({ ...newJob, openings: e.target.value })} />
                  {jobErrors.openings && <div style={{ color: 'var(--status-rejected)', marginTop: 6 }}>{jobErrors.openings}</div>}
                </div>
                <div className="field">
                  <label>Posted date</label>
                  <input placeholder="Posted date" type="date" value={newJob.posted} onChange={(e) => setNewJob({ ...newJob, posted: e.target.value })} />
                </div>
                <div className="field">
                  <label>Status</label>
                  <select value={newJob.status} onChange={(e) => setNewJob({ ...newJob, status: e.target.value })}>
                    <option value="Open">Open</option>
                    <option value="Closed">Closed</option>
                  </select>
                </div>
              </div>
              <div className="field">
                <label>Summary</label>
                <textarea placeholder="Brief summary of the role" value={newJob.summary || newJob.desc || ''} onChange={(e) => setNewJob({ ...newJob, summary: e.target.value, desc: e.target.value })} />
              </div>
              <div className="field">
                <label>Responsibilities</label>
                <textarea placeholder="Key responsibilities (one per line)" value={newJob.responsibilities || ''} onChange={(e) => setNewJob({ ...newJob, responsibilities: e.target.value })} />
              </div>
              <div className="field-row">
                <div className="field">
                  <label>Technical skills (comma separated)</label>
                  <input placeholder="e.g. React, TypeScript, Node.js" value={newJob.technical_skills || ''} onChange={(e) => setNewJob({ ...newJob, technical_skills: e.target.value })} />
                </div>
                <div className="field">
                  <label>Qualifications</label>
                  <input placeholder="e.g. B.E. in Computer Science" value={newJob.qualifications || ''} onChange={(e) => setNewJob({ ...newJob, qualifications: e.target.value })} />
                </div>
              </div>
              <div className="field">
                <label>Preferred skills / Nice to have</label>
                <input placeholder="Preferred skills (comma separated)" value={newJob.preferred_skills || ''} onChange={(e) => setNewJob({ ...newJob, preferred_skills: e.target.value })} />
              </div>
              
            </div>
            <div className="drawer-foot">
              <div />
              <div>
                <button className="btn btn-ghost" onClick={closeNewJob}>Cancel</button>
                <button className="btn btn-primary" style={{ marginLeft: 8 }} onClick={createJob}>Save Job</button>
              </div>
            </div>
          </div>
        )}
      </div>

    </div>
  )
}
