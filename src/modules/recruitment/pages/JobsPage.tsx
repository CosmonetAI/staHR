import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useToast } from '../../../components/ToastProvider'
import { CandidateService } from '../services/candidateService'

const JOBS = [
  { id: 1, title: 'HR Generalist', openings: 2, location: 'City A', posted: '2026-07-01', status: 'Open', desc: 'Responsible for general HR functions and employee relations.' },
  { id: 2, title: 'Recruitment Specialist', openings: 1, location: 'City B', posted: '2026-06-28', status: 'Open', desc: 'Focus on sourcing, screening and coordinating interviews.' },
  { id: 3, title: 'People Ops Manager', openings: 1, location: 'Remote', posted: '2026-06-15', status: 'Closed', desc: 'Lead people operations and HR programs.' }
]

export default function JobsPage() {
  const navigate = useNavigate()
  const { data: candidatesData } = useQuery(['candidates'], () => CandidateService.list(1, 1000))
  const [jobs, setJobs] = useState(JOBS)
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
                  <div className="job-meta">{job.location} - Posted {job.posted}</div>
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
                <div className="sub">{selectedJob.location} • Posted {selectedJob.posted}</div>
              </div>
              <button className="drawer-close" onClick={closeDetails}>✕</button>
            </div>
            <div className="drawer-body">
              <p>{selectedJob.desc}</p>
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
            <div className="drawer-body">
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
                  <label>Job title</label>
                  <input value={newJob.title} onChange={(e) => setNewJob({ ...newJob, title: e.target.value })} />
                </div>
                <div className="field">
                  <label>Location</label>
                  <input value={newJob.location} onChange={(e) => setNewJob({ ...newJob, location: e.target.value })} />
                </div>
              </div>
              <div className="field-row">
                <div className="field">
                  <label>Openings</label>
                  <input type="number" min="1" value={newJob.openings} onChange={(e) => setNewJob({ ...newJob, openings: e.target.value })} />
                </div>
                <div className="field">
                  <label>Posted date</label>
                  <input type="date" value={newJob.posted} onChange={(e) => setNewJob({ ...newJob, posted: e.target.value })} />
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
                <label>Description</label>
                <textarea value={newJob.desc} onChange={(e) => setNewJob({ ...newJob, desc: e.target.value })} />
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
