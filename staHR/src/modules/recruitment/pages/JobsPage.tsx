import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useToast } from '../../../components/ToastProvider'
import { CandidateService } from '../services/candidateService'

export default function JobsPage() {
  const navigate = useNavigate()
  const { data: candidatesData } = useQuery(['candidates'], () => CandidateService.list(1, 1000))
  const [jobs, setJobs] = useState<any[]>([])
  const [selectedJob, setSelectedJob] = useState<any | null>(null)
  const [applyJob, setApplyJob] = useState<any | null>(null)
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

  function openApply(job: any) {
    setApplyJob({ job, name: '', email: '', note: '' })
  }

  function closeApply() {
    setApplyJob(null)
  }

  function openNewJob() {
    const today = new Date().toISOString().slice(0, 10)
    setNewJob({ title: '', location: '', openings: 1, posted: today, status: 'Open', desc: '' })
  }

  function closeNewJob() {
    setNewJob(null)
  }

  function createJob() {
    if (!newJob) return
    if (!newJob.title || !newJob.location) {
      addToast('Job title and location required', 'error', 2000)
      return
    }

    setJobs(prev => [
      {
        id: Date.now(),
        title: newJob.title.trim(),
        openings: Math.max(1, Number(newJob.openings) || 1),
        location: newJob.location.trim(),
        posted: newJob.posted || new Date().toISOString().slice(0, 10),
        status: newJob.status || 'Open',
        desc: newJob.desc?.trim() || 'No description added yet.'
      },
      ...prev
    ])
    addToast('Job added', 'success', 2000)
    closeNewJob()
  }

  function submitApplication() {
    if (!applyJob) return
    if (!applyJob.name || !applyJob.email) {
      addToast('Name and email required', 'error', 2000)
      return
    }
    setApplications(prev => [...prev, { id: Date.now(), jobId: applyJob.job.id, name: applyJob.name, email: applyJob.email, note: applyJob.note }])
    addToast('Application submitted', 'success', 2000)
    closeApply()
  }

  return (
    <div className="container">
      <div className="jobs-page-head">
        <h2>Jobs</h2>
        <button className="btn btn-primary" onClick={openNewJob}>+ Add Job</button>
      </div>

      <div className="jobs-grid">
        {jobs.map(job => {
          const apps = applicationCount(job)

          return (
            <div key={job.id} className="card job-card">
              <div className="job-card-head">
                <div className="job-title-block">
                  <button className="job-title" onClick={() => openDetails(job)}>{job.title}</button>
                  <div className="job-meta">{job.location} • {String(job.job_id || job.job_ref || '').replace(/^job-/, '')} • Posted {job.posted}</div>
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
                <button className="btn btn-ghost" onClick={(e) => { e.stopPropagation(); openApply(job) }}>Apply</button>
                <button className="btn btn-primary" onClick={(e) => { e.stopPropagation(); navigate('/candidates?role=' + encodeURIComponent(job.title)) }}>View candidates</button>
                <button className="btn btn-ghost" onClick={(e) => { e.stopPropagation(); openDetails(job) }}>Details</button>
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
          <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div className="drawer-head">
              <div>
                <h2>{selectedJob.title}</h2>
                <div className="sub">{selectedJob.location} • ID: {String(selectedJob.job_id || selectedJob.job_ref || '').replace(/^job-/, '')} • Posted {selectedJob.posted}</div>
              </div>
              <button className="drawer-close" onClick={closeDetails}>✕</button>
            </div>
              <div className="drawer-body">
              <p>{selectedJob.summary || selectedJob.description || selectedJob.desc}</p>
              <div style={{ marginTop: 12 }}>
                <div><strong>Department:</strong> {selectedJob.department || '-'}</div>
                
                <div><strong>Employment type:</strong> {selectedJob.employment_type || '-'}</div>
                <div><strong>Work mode:</strong> {selectedJob.work_mode || '-'}</div>
                <div><strong>Experience:</strong> {(selectedJob.experience_min || '-') + (selectedJob.experience_max ? ` - ${selectedJob.experience_max}` : '')}</div>
                <div><strong>Skills:</strong> {(selectedJob.technical_skills && Array.isArray(selectedJob.technical_skills)) ? selectedJob.technical_skills.join(', ') : (selectedJob.technical_skills || '-')}</div>
                <div style={{ marginTop: 8 }}><strong>Responsibilities:</strong><div style={{ whiteSpace: 'pre-wrap' }}>{selectedJob.responsibilities || '-'}</div></div>
                
              </div>
              <div className="job-detail-metrics">
                <div className="job-metric">
                  <div className="job-metric-value">{selectedJob.openings}</div>
                  <div className="job-metric-label">Opening{selectedJob.openings === 1 ? '' : 's'}</div>
                </div>
                <div className="job-metric">
                  <div className="job-metric-value">{applicationCount(selectedJob)}</div>
                  <div className="job-metric-label">Application{applicationCount(selectedJob) === 1 ? '' : 's'}</div>
                </div>
              </div>
              <p><strong>Status:</strong> <span className={`badge ${selectedJob.status === 'Open' ? 'progress' : 'dropped'}`}>{selectedJob.status}</span></p>
            </div>
              <div style={{ marginTop: 8 }} className="hint">Required fields: Job title, Location, Openings.</div>
            <div className="drawer-foot">
              <div />
              <div>
                <button className="btn btn-ghost" onClick={closeDetails}>Close</button>
                <button className="btn btn-primary" style={{ marginLeft: 8 }} onClick={() => { closeDetails(); openApply(selectedJob) }}>Apply</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Apply modal */}
      <div className={`overlay ${applyJob ? 'open' : ''}`} onClick={closeApply} />
      <div className={`modal ${applyJob ? 'open' : ''}`} onClick={(e) => e.stopPropagation()}>
        {applyJob && (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="drawer-head">
              <div>
                <h2>Apply: {applyJob.job.title}</h2>
                <div className="sub">{applyJob.job.location}</div>
              </div>
              <button className="drawer-close" onClick={closeApply}>✕</button>
            </div>
            <div className="drawer-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              <div className="field">
                <label>Name</label>
                <input value={applyJob.name} onChange={(e) => setApplyJob({ ...applyJob, name: e.target.value })} />
              </div>
              <div className="field">
                <label>Email</label>
                <input value={applyJob.email} onChange={(e) => setApplyJob({ ...applyJob, email: e.target.value })} />
              </div>
              <div className="field">
                <label>Note / message</label>
                <textarea value={applyJob.note} onChange={(e) => setApplyJob({ ...applyJob, note: e.target.value })} />
              </div>
            </div>
            <div className="drawer-foot">
              <div />
              <div>
                <button className="btn btn-ghost" onClick={closeApply}>Cancel</button>
                <button className="btn btn-primary" style={{ marginLeft: 8 }} onClick={submitApplication}>Submit application</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Add job modal */}
      <div className={`overlay ${newJob ? 'open' : ''}`} onClick={closeNewJob} />
      <div className={`modal ${newJob ? 'open' : ''}`} onClick={(e) => e.stopPropagation()}>
        {newJob && (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="drawer-head">
              <div>
                <h2>Add Job</h2>
                <div className="sub">Create a basic job listing</div>
              </div>
              <button className="drawer-close" onClick={closeNewJob}>x</button>
            </div>
            <div className="drawer-body">
              <div className="field-row">
                <div className="field">
                  <label>Job title *</label>
                  <input required placeholder="e.g. Software Engineer" value={newJob.title} onChange={(e) => setNewJob({ ...newJob, title: e.target.value })} />
                </div>
                <div className="field">
                  <label>Location *</label>
                  <input required placeholder="e.g. Bengaluru, India" value={newJob.location} onChange={(e) => setNewJob({ ...newJob, location: e.target.value })} />
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
