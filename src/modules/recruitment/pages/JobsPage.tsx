import React, { useState, useEffect, useMemo } from 'react'
import { FaThLarge, FaList, FaPaperPlane, FaUsers, FaInfoCircle, FaPen, FaTrashAlt } from 'react-icons/fa'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useToast } from '../../../components/ToastProvider'
import { CandidateService } from '../services/candidateService'
import { JobService } from '../services/jobService'
import { useAuth } from '../../../hooks/useAuth'
import ClientService from '../services/clientService'
import JobDescriptionUploader from '../../../components/JobDescriptionUploader/JobDescriptionUploader'
import { ParsedJobDescription } from '../../../types/job'

export default function JobsPage() {
  const { user, isClient } = useAuth()
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
  const [clients, setClients] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [clientFilter, setClientFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [postedStart, setPostedStart] = useState('')
  const [postedEnd, setPostedEnd] = useState('')
  const [openFilter, setOpenFilter] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'row' | 'card'>('card')

  const clientsMap = React.useMemo(() => {
    const m: Record<string,string> = {}
    clients.forEach((c: any) => { if (c && c.id) m[String(c.id)] = c.name })
    return m
  }, [clients])

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const list = await ClientService.list()
        if (!mounted) return
        setClients(list || [])
      } catch (e) {
        // ignore
      }
    })()
    return () => { mounted = false }
  }, [])

  // Close open filter menus when clicking outside
  React.useEffect(() => {
    function onDocClick(e: MouseEvent) {
      try {
        const target = e.target as HTMLElement | null
        if (!target) return
        if (!target.closest('.filter-menu')) setOpenFilter(null)
      } catch (err) {
        // ignore
      }
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [])
  const [selectedJob, setSelectedJob] = useState<any | null>(null)
  const [newJob, setNewJob] = useState<any | null>(null)
  const [autoFilledFields, setAutoFilledFields] = useState<string[]>([])
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
    setAutoFilledFields([])
  }

  function applyParsedToNewJob(data: ParsedJobDescription) {
    if (!newJob) return
    const mapping: Record<string, string> = {
      jobTitle: 'title',
      department: 'department',
      location: 'location',
      numberOfPositions: 'openings',
      summary: 'summary',
      jobDescription: 'desc',
      primarySkills: 'technical_skills',
      responsibilities: 'responsibilities',
      qualifications: 'qualifications',
      preferredSkills: 'preferred_skills',
      // experience handled separately
      employmentType: 'employment_type',
      workMode: 'work_mode'
    }

    const toSet: Record<string, any> = {}
    const conflicts: string[] = []

    Object.keys(mapping).forEach((k) => {
      const val = (data as any)[k]
      if (val === undefined || val === null) return
      const dest = mapping[k]
      if (Array.isArray(val)) {
        // join arrays into comma separated for technical_skills, preferred_skills
        if (dest === 'technical_skills' || dest === 'preferred_skills') toSet[dest] = val.join(', ')
        else if (dest === 'responsibilities') toSet[dest] = val.join('\n')
        else toSet[dest] = val.join(', ')
      } else {
        toSet[dest] = val
      }
      if (newJob[dest] && String(newJob[dest]).trim() !== '') conflicts.push(dest)
    })

    // experience
    if (data.experience) {
      if (typeof data.experience.minimum === 'number') {
        toSet.experience_min = data.experience.minimum
        if (newJob.experience_min && String(newJob.experience_min).trim() !== '') conflicts.push('experience_min')
      }
      if (typeof data.experience.maximum === 'number') {
        toSet.experience_max = data.experience.maximum
        if (newJob.experience_max && String(newJob.experience_max).trim() !== '') conflicts.push('experience_max')
      }
    }

    // openings
    if (typeof data.numberOfPositions === 'number' && (!newJob.openings || String(newJob.openings).trim() === '')) {
      toSet.openings = data.numberOfPositions
    }

    if (conflicts.length > 0) {
      const ok = window.confirm(`The following fields have existing values and will be overwritten: ${conflicts.join(', ')}. Overwrite?`)
      if (!ok) {
        // apply only non-conflicting
        Object.keys(toSet).forEach((k) => { if (!conflicts.includes(k)) newJob[k] = toSet[k] })
        setNewJob({ ...newJob })
        setAutoFilledFields(Object.keys(toSet).filter((k) => !conflicts.includes(k)))
        return
      }
    }

    // apply all
    Object.assign(newJob, toSet)
    setNewJob({ ...newJob })
    setAutoFilledFields(Object.keys(toSet))
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

  

  const filteredJobs = useMemo(() => {
    const q = String(search || '').trim().toLowerCase()
    const tokens = q ? q.split(/\s+/).filter(Boolean) : []
    return (jobs || []).filter((j: any) => {
      if (statusFilter && statusFilter !== 'All') {
        if ((j.status || 'Open') !== statusFilter) return false
      }
      if (clientFilter) {
        const cid = String(j.client_id || j.client_name || '')
        if (cid !== String(clientFilter)) return false
      }
      // posted date range filter (inclusive)
      if (postedStart || postedEnd) {
        const posted = j.posted || j.posted_date || ''
        const postedTs = isNaN(Date.parse(String(posted))) ? NaN : Date.parse(String(posted))
        if (postedStart) {
          const startTs = Date.parse(String(postedStart))
          if (isNaN(postedTs) || postedTs < startTs) return false
        }
        if (postedEnd) {
          const endTs = Date.parse(String(postedEnd))
          // include entire end day
          if (isNaN(postedTs) || postedTs > (endTs + 24 * 60 * 60 * 1000 - 1)) return false
        }
      }

      if (!tokens.length) return true

      // Build a searchable text blob including key fields
      const gather = (val: any) => {
        if (val == null) return ''
        if (Array.isArray(val)) return val.join(' ')
        return String(val)
      }
      const txt = [
        j.title,
        j.location,
        clientsMap[String(j.client_id || j.client_name || '')] || j.client_name,
        j.summary,
        j.desc,
        j.description,
        j.job_description,
        j.technical_skills,
        j.preferred_skills,
        j.responsibilities,
        j.qualifications,
        j.job_id,
        j.job_ref,
        j.id
      ].map(gather).join(' ').toLowerCase()

      // require all tokens to be present (AND)
      return tokens.every(tok => txt.includes(tok))
    })
  }, [jobs, search, clientFilter, statusFilter, clientsMap, postedStart, postedEnd])

  return (
    <div className="container">
      <div className="jobs-page-head">
        <h2>Jobs</h2>
        {!isClient && <button className="btn btn-primary" onClick={openNewJob}>+ Add Job</button>}
      </div>

      <div className="toolbar candidates-toolbar" style={{ marginTop: 12, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
        <div className="search-box">
          <span>🔍</span>
          <input placeholder="Search jobs, location, client..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        <div className="filter-menu">
          <select className="filter-summary" value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}>
            <option value="">All clients</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div className="filter-menu">
          <select className="filter-summary" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="All">All Status</option>
            <option value="Open">Open</option>
            <option value="Closed">Closed</option>
          </select>
        </div>

        <div className={`filter-menu ${openFilter === 'posted' ? 'open' : ''}`}>
          <button type="button" className="filter-summary" onClick={() => setOpenFilter(openFilter === 'posted' ? null : 'posted')}>
            {postedStart || postedEnd ? `Posted: ${postedStart || '—'} → ${postedEnd || '—'}` : 'Posted Date'}
          </button>
          {openFilter === 'posted' && (
            <div className="filter-menu-panel posted">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label className="filter-check" style={{ alignItems: 'flex-start' }}>
                  <div style={{ fontSize: 12, marginBottom: 4 }}>Start</div>
                  <input type="date" value={postedStart} onChange={(e) => setPostedStart(e.target.value)} />
                </label>
                <label className="filter-check" style={{ alignItems: 'flex-start' }}>
                  <div style={{ fontSize: 12, marginBottom: 4 }}>End</div>
                  <input type="date" value={postedEnd} onChange={(e) => setPostedEnd(e.target.value)} />
                </label>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button className="btn btn-ghost" onClick={() => { setPostedStart(''); setPostedEnd(''); setOpenFilter(null); }}>Clear</button>
                </div>
              </div>
            </div>
          )}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button type="button" className={`icon-btn ${viewMode === 'row' ? 'active' : ''}`} onClick={() => setViewMode('row')} title="List view"><FaList /></button>
          <button type="button" className={`icon-btn ${viewMode === 'card' ? 'active' : ''}`} onClick={() => setViewMode('card')} title="Card view"><FaThLarge /></button>
        </div>
      </div>
      {viewMode === 'card' ? (
        <div className="jobs-grid">
          {loadingJobs && <div className="card">Loading jobs…</div>}
          {filteredJobs.map(job => {
          const apps = applicationCount(job)

          return (
            <div key={job.id} className="card job-card" onClick={() => openDetails(job)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') openDetails(job) }}>
              <div className="job-card-head">
                <div className="job-title-block">
                  <button className="job-title" onClick={() => openDetails(job)}>{job.title}</button>
                  <div className="job-meta">{job.location} {job.client_id || job.client_name ? '• ' : ''}{clientsMap[String(job.client_id || job.client_name || '')] || job.client_name || ''}{(job.client_id || job.client_name) ? ' • ' : ''}JOB ID: {String(job.job_id || job.job_ref || job.id || '')} • Posted {job.posted}</div>
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
                {!isClient && job.status !== 'Closed' && (
                    <button className="btn btn-ghost" onClick={(e) => { e.stopPropagation(); navigate('/candidates?job_ref=' + encodeURIComponent(job.job_id || job.job_ref || job.id) + '&job_title=' + encodeURIComponent(job.title)) }}>Apply</button>
                  )}
                <button className="btn btn-primary" onClick={(e) => { e.stopPropagation(); navigate('/candidates?role=' + encodeURIComponent(job.title)) }}>View candidates</button>
                <button className="btn btn-ghost" onClick={(e) => { e.stopPropagation(); openDetails(job) }}>Details</button>
                {!isClient && (
                  <>
                    <button className="btn btn-ghost" onClick={(e) => { e.stopPropagation(); setNewJob({ ...job }) }}>Edit</button>
                    <button className="btn btn-danger" onClick={(e) => { e.stopPropagation(); deleteJob(job) }}>Delete</button>
                  </>
                )}
              </div>
            </div>
          )
          })}
        </div>
      ) : (
        <div className="card">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '8px 12px' }}>Title</th>
                <th style={{ textAlign: 'left', padding: '8px 12px' }}>Location</th>
                <th style={{ textAlign: 'left', padding: '8px 12px' }}>Client</th>
                <th style={{ textAlign: 'left', padding: '8px 12px' }}>Posted</th>
                <th style={{ textAlign: 'left', padding: '8px 12px' }}>Status</th>
                <th style={{ textAlign: 'right', padding: '8px 12px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredJobs.map(job => {
                const apps = applicationCount(job)
                return (
                  <tr key={job.id} role="button" tabIndex={0} onClick={() => openDetails(job)} onKeyDown={(e) => { if (e.key === 'Enter') openDetails(job) }}>
                    <td style={{ padding: '10px 12px' }}>{job.title}</td>
                    <td style={{ padding: '10px 12px' }}>{job.location}</td>
                    <td style={{ padding: '10px 12px' }}>{clientsMap[String(job.client_id || job.client_name || '')] || job.client_name || ''}</td>
                    <td style={{ padding: '10px 12px' }}>{job.posted}</td>
                    <td style={{ padding: '10px 12px' }}>{job.status}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
                        {!isClient && job.status !== 'Closed' && (
                          <button className="btn btn-ghost" title="Apply" onClick={(e) => { e.stopPropagation(); navigate('/candidates?job_ref=' + encodeURIComponent(job.job_id || job.job_ref || job.id) + '&job_title=' + encodeURIComponent(job.title)) }}><FaPaperPlane /></button>
                        )}
                        <button className="btn btn-primary" title="View candidates" onClick={(e) => { e.stopPropagation(); navigate('/candidates?role=' + encodeURIComponent(job.title)) }}><FaUsers /></button>
                        <button className="btn btn-ghost" title="Details" onClick={(e) => { e.stopPropagation(); openDetails(job) }}><FaInfoCircle /></button>
                        {!isClient && (
                          <>
                            <button className="btn btn-ghost" title="Edit" onClick={(e) => { e.stopPropagation(); setNewJob({ ...job }) }}><FaPen /></button>
                            <button className="btn btn-danger" title="Delete" onClick={(e) => { e.stopPropagation(); deleteJob(job) }}><FaTrashAlt /></button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

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
                  <span>Client: {clientsMap[String(selectedJob.client_id || selectedJob.client_name || '')] || selectedJob.client_name || '-'}</span>
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
                {!isClient && selectedJob.status !== 'Closed' ? (
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
              <div style={{ marginBottom: 12 }}>
                <JobDescriptionUploader onParsed={(data: ParsedJobDescription) => applyParsedToNewJob(data)} />
              </div>
                <div className="field-row">
                <div className="field">
                  <label>Job title *</label>
                  <input required placeholder="e.g. Software Engineer" value={newJob.title} onChange={(e) => setNewJob({ ...newJob, title: e.target.value })} style={autoFilledFields.includes('title') ? { outline: '2px solid #1976d2' } : undefined} />
                  {jobErrors.title && <div style={{ color: 'var(--status-rejected)', marginTop: 6 }}>{jobErrors.title}</div>}
                </div>
                <div className="field">
                  <label>Location *</label>
                  <input required placeholder="e.g. Bengaluru, India" value={newJob.location} onChange={(e) => setNewJob({ ...newJob, location: e.target.value })} style={autoFilledFields.includes('location') ? { outline: '2px solid #1976d2' } : undefined} />
                  {jobErrors.location && <div style={{ color: 'var(--status-rejected)', marginTop: 6 }}>{jobErrors.location}</div>}
                </div>
              </div>
              <div className="field-row">
                <div className="field">
                  <label>Department</label>
                  <input placeholder="e.g. Engineering" value={newJob.department || ''} onChange={(e) => setNewJob({ ...newJob, department: e.target.value })} style={autoFilledFields.includes('department') ? { outline: '2px solid #1976d2' } : undefined} />
                </div>
                <div className="field">
                  <label>Client</label>
                  <select value={newJob.client_id || ''} onChange={(e) => {
                    const id = e.target.value
                    const c = clients.find(x => String(x.id) === id)
                    setNewJob({ ...newJob, client_id: id, client_name: c ? c.name : '' })
                  }}>
                    <option value="">— none —</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="field-row">
                <div className="field">
                  <label>Employment type</label>
                  <select value={newJob.employment_type || ''} onChange={(e) => setNewJob({ ...newJob, employment_type: e.target.value })} style={autoFilledFields.includes('employment_type') ? { outline: '2px solid #1976d2' } : undefined}>
                    <option value="">— select —</option>
                    <option value="Full-Time">Full-Time</option>
                    <option value="Part-Time">Part-Time</option>
                    <option value="Contract">Contract</option>
                    <option value="Internship">Internship</option>
                  </select>
                </div>
                <div className="field">
                  <label>Work mode</label>
                  <select value={newJob.work_mode || ''} onChange={(e) => setNewJob({ ...newJob, work_mode: e.target.value })} style={autoFilledFields.includes('work_mode') ? { outline: '2px solid #1976d2' } : undefined}>
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
                  <input placeholder="Min years (e.g. 2)" type="number" min="0" value={newJob.experience_min || ''} onChange={(e) => setNewJob({ ...newJob, experience_min: Number(e.target.value) || null })} style={autoFilledFields.includes('experience_min') ? { outline: '2px solid #1976d2' } : undefined} />
                </div>
                <div className="field">
                  <label>Experience (max)</label>
                  <input placeholder="Max years (e.g. 5)" type="number" min="0" value={newJob.experience_max || ''} onChange={(e) => setNewJob({ ...newJob, experience_max: Number(e.target.value) || null })} style={autoFilledFields.includes('experience_max') ? { outline: '2px solid #1976d2' } : undefined} />
                </div>
              </div>
              <div className="field-row">
                <div className="field">
                  <label>Openings *</label>
                  <input required placeholder="Number of openings" type="number" min="1" value={newJob.openings} onChange={(e) => setNewJob({ ...newJob, openings: e.target.value })} style={autoFilledFields.includes('openings') ? { outline: '2px solid #1976d2' } : undefined} />
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
                <textarea placeholder="Brief summary of the role" value={newJob.summary || newJob.desc || ''} onChange={(e) => setNewJob({ ...newJob, summary: e.target.value, desc: e.target.value })} style={autoFilledFields.includes('summary') ? { outline: '2px solid #1976d2' } : undefined} />
              </div>
              <div className="field">
                <label>Responsibilities</label>
                <textarea placeholder="Key responsibilities (one per line)" value={newJob.responsibilities || ''} onChange={(e) => setNewJob({ ...newJob, responsibilities: e.target.value })} style={autoFilledFields.includes('responsibilities') ? { outline: '2px solid #1976d2' } : undefined} />
              </div>
              <div className="field-row">
                <div className="field">
                  <label>Technical skills (comma separated)</label>
                  <input placeholder="e.g. React, TypeScript, Node.js" value={newJob.technical_skills || ''} onChange={(e) => setNewJob({ ...newJob, technical_skills: e.target.value })} style={autoFilledFields.includes('technical_skills') ? { outline: '2px solid #1976d2' } : undefined} />
                </div>
                <div className="field">
                  <label>Qualifications</label>
                  <input placeholder="e.g. B.E. in Computer Science" value={newJob.qualifications || ''} onChange={(e) => setNewJob({ ...newJob, qualifications: e.target.value })} style={autoFilledFields.includes('qualifications') ? { outline: '2px solid #1976d2' } : undefined} />
                </div>
              </div>
              <div className="field">
                <label>Preferred skills / Nice to have</label>
                <input placeholder="Preferred skills (comma separated)" value={newJob.preferred_skills || ''} onChange={(e) => setNewJob({ ...newJob, preferred_skills: e.target.value })} style={autoFilledFields.includes('preferred_skills') ? { outline: '2px solid #1976d2' } : undefined} />
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
