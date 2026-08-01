import React, { useMemo, useState } from 'react'

import { useQuery } from '@tanstack/react-query'
import { useLocation } from 'react-router-dom'
import { CandidateService } from '../services/candidateService'
import FileUpload from '../../../components/FileUpload'
import CandidateForm from '../components/CandidateForm'
import { useToast } from '../../../components/ToastProvider'
import { parseCSVFile } from '../../../utils/csvUtils'
import CANDIDATE_HEADERS, { CANDIDATE_HEADER_LABELS } from '../../../utils/headers'
import {
  FaBriefcase,
  FaCalendarAlt,
  FaClock,
  FaEnvelope,
  FaLinkedin,
  FaMapMarkerAlt,
  FaMoneyBillWave,
  FaPen,
  FaPhoneAlt,
  FaStickyNote,
  FaTrashAlt,
  FaUserCheck
} from 'react-icons/fa'
import * as XLSX from 'xlsx'
import { JobService } from '../services/jobService'
import { useAuth } from '../../../hooks/useAuth'

export default function Candidates() {
  const { user, isClient } = useAuth()
  const location = useLocation()
  const { data, isLoading } = useQuery(['candidates'], () => CandidateService.list(1, 1000), { retry: false })
  
  const all = (data && data.data) ? data.data : []
  const [rows, setRows] = useState<any[]>(all)

  // keep rows in sync with fetched data
  React.useEffect(() => {
    setRows(all)
  }, [all])
  const roles = useMemo(() => {
    const set = new Set<string>()
    all.forEach((c: any) => set.add((c.role || 'Unassigned').toString()))
    return Array.from(set).sort()
  }, [all])

  const [selectedRoles, setSelectedRoles] = useState<string[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [statusMenuFor, setStatusMenuFor] = useState<string | null>(null)
  const addToast = useToast()
  const [lastChange, setLastChange] = useState<{id:string, prev:string} | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilters, setStatusFilters] = useState<string[]>([])
  const [sortFields, setSortFields] = useState<string[]>(['date_desc'])
  const [showUpload, setShowUpload] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<any>({})
  const [importPreview, setImportPreview] = useState<any[]>([])
  const [importErrors, setImportErrors] = useState<any[]>([])
  const [openFilter, setOpenFilter] = useState<string | null>(null)
  const [jobsMap, setJobsMap] = useState<Record<string, any>>({})

  // load jobs once into a lookup map keyed by job_id, job_ref, and id
  React.useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const list = await JobService.list()
        if (!mounted) return
        const map: Record<string, any> = {};
        ;(list || []).forEach((j: any) => {
          const keys = [j.job_id, j.job_ref, j.id].filter(Boolean).map((k: any) => String(k))
          keys.forEach((k: string) => { map[k] = j })
        })
        setJobsMap(map)
      } catch (e) {
        // ignore
      }
    })()
    return () => { mounted = false }
  }, [])

  React.useEffect(() => {
    const role = new URLSearchParams(location.search).get('role')
    if (role) setSelectedRoles([role])
  }, [location.search])

  // If navigated from a job Apply action, prefill and open the Add Candidate drawer
  React.useEffect(() => {
    const params = new URLSearchParams(location.search)
    const jobRef = params.get('job_ref')
    const jobId = params.get('job_id')
    const jobTitle = params.get('job_title')
    if (jobRef || jobId || jobTitle) {
      ;(async () => {
        let title = jobTitle || ''
        let resolvedJobId = jobId || ''
        if (!title && jobRef) {
          try {
            const FUNCTIONS_BASE = import.meta.env.VITE_FUNCTIONS_BASE || '/functions/v1'
            const anon = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '')
            const res = await fetch(`${FUNCTIONS_BASE}/jobs/${encodeURIComponent(jobRef)}`, { headers: { 'Content-Type': 'application/json', ...(anon ? { apikey: anon } : {}) } })
            if (res.ok) {
              const json = await res.json()
              title = json?.title || title
              resolvedJobId = json?.id || resolvedJobId
            }
          } catch (e) {
            console.error('Failed to resolve job ref', e)
          }
        }
        setEditingId(null)
        setForm({ role: title || '', name: '', date: new Date().toISOString().slice(0, 10), exp: '', cctc: '', ectc: '', email: '', phone: '', linkedin: '', location: '', np: '', availability: '', intstatus: '', selstatus: 'progress', remarks: '', f2f: '', applied_job_id: resolvedJobId || jobRef || '', job_id: resolvedJobId || jobRef || '' })
        setDrawerOpen(true)
      })()
    }
  }, [location.search])

  function normalizedStatus(status: string) {
    const s = String(status || 'progress').toLowerCase()
    if (s.includes('select')) return 'selected'
    if (s.includes('reject')) return 'rejected'
    if (s.includes('hold')) return 'hold'
    if (s.includes('drop')) return 'dropped'
    return 'progress'
  }

  function activityTime(row: any) {
    const raw = row.updated_at || ''
    const parsed = Date.parse(String(raw))
    return Number.isNaN(parsed) ? 0 : parsed
  }

  function noticeDays(row: any) {
    const text = String(row?.np ?? '').trim().toLowerCase()
    if (!text) return Number.POSITIVE_INFINITY
    if (text.includes('immediate')) return 0
    const match = text.replace(/,/g, '').match(/\d+(\.\d+)?/)
    return match ? Number(match[0]) : Number.POSITIVE_INFINITY
  }

  function exportCSV() {
    try {
      const visibleRows = filteredRows
      const toExport = selectedIds.length ? rows.filter(r => selectedIds.includes(r.id)) : visibleRows
      if (!toExport.length) { addToast('No rows to export', 'info'); return }
      // Use canonical headers so exports match imports/samples
      const colsDef = CANDIDATE_HEADERS.map((h) => {
        return {
          k: h,
          h,
          v: (r: any) => {
            if (h === 'experience') return (r.exp || r.experience || '')
            if (h === 'current_ctc') return (r.cctc || r.current_ctc || '')
            if (h === 'expected_ctc') return (r.ectc || r.expected_ctc || '')
            if (h === 'current_location') return (r.location || r.current_location || '')
            if (h === 'notice_period') return (r.np || r.notice_period || '')
            if (h === 'role') return (r.role || r.job_role || '')
            if (h === 'job_id') return (r.job_id || r.applied_job_id || r.job_ref || '')
            return (r[h] ?? '')
          }
        }
      })
      const esc = (v: any) => {
        if (v === null || typeof v === 'undefined') return ''
        const s = String(v).replace(/"/g, '""')
        return `"${s}"`
      }
      const header = colsDef.map(c => {
        const idx = CANDIDATE_HEADERS.indexOf(c.k)
        const label = idx >= 0 ? CANDIDATE_HEADER_LABELS[idx] : c.h
        return esc(label)
      }).join(',')
      const rowsCsv = toExport.map(r => colsDef.map(c => esc((c.v ? c.v(r) : r[c.k]))).join(','))
      const csv = [header].concat(rowsCsv).join('\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `candidates_${new Date().toISOString().slice(0,10)}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      addToast('CSV downloaded', 'success')
    } catch (e) {
      addToast('Export failed', 'error')
    }
  }

  function downloadSampleCSV() {
    try {
      const cols = CANDIDATE_HEADERS
      const sampleRows = [
        {
          name: 'Alice Doe', email: 'alice@example.com', phone: '9876543210', experience: '3', current_company: '', current_location: 'Bengaluru', preferred_location: '', skills: '', notice_period: '30', current_ctc: '8', expected_ctc: '12', date: new Date().toISOString().slice(0,10), role: 'Frontend Engineer', selstatus: 'progress', intstatus: 'Phone screen', availability: '', remarks: 'Strong React skills', linkedin: 'https://linkedin.com/in/alice', interview_slot: '', confirmed_availability: '', f2f: ''
        },
        {
          name: 'Bob Kumar', email: 'bob@example.com', phone: '9123456780', experience: '5', current_company: '', current_location: 'Mumbai', preferred_location: '', skills: '', notice_period: '15', current_ctc: '15', expected_ctc: '20', date: new Date().toISOString().slice(0,10), role: 'Backend Engineer', selstatus: 'progress', intstatus: 'Interview round 1', availability: '', remarks: '', linkedin: '', interview_slot: '', confirmed_availability: '', f2f: ''
        }
      ]

      const esc = (v:any) => {
        if (v === null || typeof v === 'undefined') return ''
        const s = String(v).replace(/"/g, '""')
        return `"${s}"`
      }
      const header = cols.map((c, i) => esc(CANDIDATE_HEADER_LABELS[i] || c)).join(',')
      const rowsCsv = sampleRows.map(r => cols.map(k => esc((r as any)[k])).join(','))
      const csv = [header].concat(rowsCsv).join('\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `candidates_sample_${new Date().toISOString().slice(0,10)}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      addToast('Sample CSV downloaded', 'success')
    } catch (e) {
      addToast('Download failed', 'error')
    }
  }

  function downloadSampleExcel() {
    try {
      const sampleRows = [
        { name: 'Alice Doe', email: 'alice@example.com', phone: '9876543210', experience: 3, current_company: '', current_location: 'Bengaluru', preferred_location: '', skills: '', notice_period: '30', current_ctc: 8, expected_ctc: 12, date: new Date().toISOString().slice(0,10), role: 'Frontend Engineer', selstatus: 'progress', intstatus: 'Phone screen', availability: '', remarks: 'Strong React skills', linkedin: 'https://linkedin.com/in/alice', interview_slot: '', confirmed_availability: '', f2f: '' },
        { name: 'Bob Kumar', email: 'bob@example.com', phone: '9123456780', experience: 5, current_company: '', current_location: 'Mumbai', preferred_location: '', skills: '', notice_period: '15', current_ctc: 15, expected_ctc: 20, date: new Date().toISOString().slice(0,10), role: 'Backend Engineer', selstatus: 'progress', intstatus: 'Interview round 1', availability: '', remarks: '', linkedin: '', interview_slot: '', confirmed_availability: '', f2f: '' }
      ]
      const aoa = []
      aoa.push(CANDIDATE_HEADER_LABELS)
      sampleRows.forEach((r) => {
        aoa.push(CANDIDATE_HEADERS.map(h => (r as any)[h] ?? ''))
      })
      const ws = XLSX.utils.aoa_to_sheet(aoa)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'candidates')
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
      const blob = new Blob([wbout], { type: 'application/octet-stream' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `candidates_sample_${new Date().toISOString().slice(0,10)}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      addToast('Sample Excel downloaded', 'success')
    } catch (e) {
      addToast('Download failed', 'error')
    }
  }

  const filteredRows = useMemo(() => {
    let tmp = rows.slice()
    if (selectedRoles.length) tmp = tmp.filter(r => selectedRoles.includes((r.role || 'Unassigned').toString()))
    if (search) {
      const s = String(search).toLowerCase()
      tmp = tmp.filter((d: any) => {
        const base = String((d.name || '') + ' ' + (d.email || '') + ' ' + (d.location || '') + ' ' + (d.applied_job_id || d.job_id || '') + ' ' + (d.job_id || '') + ' ' + (d.job_ref || '')).toLowerCase()
        // If applied_job_id references a job record, include that job's friendly ids/titles in the search
        let jobExtras = ''
        try {
          const key = String(d.applied_job_id || d.job_id || d.job_ref || '')
          const job = jobsMap[key]
          if (job) {
            jobExtras = String((job.job_id || '') + ' ' + (job.job_ref || '') + ' ' + (job.title || '')).toLowerCase()
          }
        } catch (err) {
          // ignore
        }
        const combined = (base + ' ' + jobExtras).toLowerCase()
        return combined.includes(s)
      })
    }
    if (statusFilters.length) tmp = tmp.filter((d: any) => statusFilters.includes(normalizedStatus(d.selstatus)))
    tmp = tmp.slice().sort((a: any, b: any) => {
      for (const sortField of sortFields) {
        let result = 0
        if (sortField === 'date_desc') result = activityTime(b) - activityTime(a)
        if (sortField === 'date_asc') result = activityTime(a) - activityTime(b)
        if (sortField === 'name_asc') result = (a.name || '').localeCompare(b.name || '')
        if (sortField === 'exp_desc') result = parseFloat(b.exp || '0') - parseFloat(a.exp || '0')
        if (sortField === 'notice_asc') result = noticeDays(a) - noticeDays(b)
        if (result !== 0) return result
      }
      return 0
    })
    return tmp
  }, [rows, selectedRoles, search, statusFilters, sortFields, jobsMap])

  // regenerate grouping from filtered rows so the UI shows filtered buckets
  const grouped = useMemo(() => {
    const g: Record<string, any[]> = {}
    filteredRows.forEach((c: any) => {
      const r = c.role || 'Unassigned'
      g[r] = g[r] || []
      g[r].push(c)
    })
    return g
  }, [filteredRows])

  const STAGE_ORDER = ['progress', 'hold', 'selected']
  const STATUS_LABEL: any = { selected: 'Selected', rejected: 'Rejected', hold: 'On hold', progress: 'In progress', dropped: 'Dropped out' }
  const STATUS_OPTIONS = ['progress', 'hold', 'selected', 'rejected', 'dropped']
  const display = (value: any) => String(value ?? '').trim() || '-'
  const statusLabel = (status: string) => STATUS_LABEL[normalizedStatus(status)] || display(status)
  const toggleFilterValue = (values: string[], value: string, setter: (next: string[]) => void) => {
    setter(values.includes(value) ? values.filter(v => v !== value) : [...values, value])
  }
  const toggleFilterMenu = (key: string) => setOpenFilter(openFilter === key ? null : key)
  const SORT_LABEL: any = { date_desc: 'Recently updated', date_asc: 'Oldest updated', name_asc: 'Name A-Z', exp_desc: 'Experience (high-low)', notice_asc: 'Notice period (low-high)' }
  const SORT_OPTIONS = ['date_desc', 'date_asc', 'name_asc', 'exp_desc', 'notice_asc']
  const toggleSortValue = (value: string) => {
    setSortFields(prev => {
      const next = prev.includes(value) ? prev.filter(v => v !== value) : [...(prev.length === 1 && prev[0] === 'date_desc' ? [] : prev), value]
      return next.length ? next : ['date_desc']
    })
  }
  const statusFilterLabel = statusFilters.length ? `${statusFilters.length} statuses` : 'All statuses'
  const roleFilterLabel = selectedRoles.length ? `${selectedRoles.length} roles` : 'All roles'
  const sortFilterLabel = sortFields.length === 1 ? SORT_LABEL[sortFields[0]] : `${sortFields.length} sorts`
  const candidateListTitle = selectedRoles.length === 1 ? `Candidates for ${selectedRoles[0]}` : 'All Candidates'
  const toggleExpanded = (id: string) => setExpandedId(expandedId === id ? null : id)
  const toNumber = (value: any) => {
    const match = String(value ?? '').replace(/,/g, '').match(/-?\d+(\.\d+)?/)
    return match ? Number(match[0]) : NaN
  }
  const hikeLabel = (current: any, expected: any) => {
    const currentValue = toNumber(current)
    const expectedValue = toNumber(expected)
    if (!Number.isFinite(currentValue) || !Number.isFinite(expectedValue) || currentValue <= 0) return ''
    const pct = Math.round(((expectedValue - currentValue) / currentValue) * 100)
    return `${pct >= 0 ? '+' : ''}${pct}%`
  }
  const formatCtc = (value: any) => {
    const text = String(value ?? '').trim()
    if (!text) return '-'
    const withoutUnit = text.replace(/lpa/ig, '').trim()
    const numeric = Number(withoutUnit.replace(/,/g, ''))
    const displayValue = Number.isFinite(numeric) ? String(Number(numeric.toFixed(2))) : withoutUnit
    return `${displayValue} LPA`
  }
  const formatLocation = (value: any) => {
    const text = String(value ?? '').trim()
    if (!text) return '-'
    return text
      .split(/\s+/)
      .map(part => part ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : part)
      .join(' ')
  }
  const formatExperience = (value: any) => {
    const text = String(value ?? '').trim()
    if (!text) return '-'
    return /years?/i.test(text) ? text.replace(/years?/i, 'years') : `${text} years`
  }
  const formatNoticePeriod = (value: any) => {
    const text = String(value ?? '').trim()
    if (!text) return '-'
    return /^\d+(\.\d+)?$/.test(text) ? `${text} days` : text
  }

  // Close open popup menus (filters / status menu) when clicking outside
  React.useEffect(() => {
    function onDocClick(e: MouseEvent) {
      try {
        const target = e.target as HTMLElement | null
        if (!target) return
        // if click is inside any filter-menu, do not close filter
        if (!target.closest('.filter-menu')) {
          setOpenFilter(null)
        }
        // if click is inside status-menu or status-cell, do not close status menu
        if (!target.closest('.status-menu') && !target.closest('.status-cell')) {
          setStatusMenuFor(null)
        }
      } catch (err) {
        // ignore
      }
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [])

  // When a row is expanded, ensure its job info is resolved (fetch if unknown)
  React.useEffect(() => {
    if (!expandedId) return
    const candidate = rows.find(r => String(r.id) === String(expandedId))
    if (!candidate) return
    const key = String(candidate.applied_job_id || candidate.job_id || candidate.job_ref || '')
    if (!key) return
    if (jobsMap[key]) return
    let mounted = true
    ;(async () => {
      try {
        const job = await JobService.get(key)
        if (!mounted || !job) return
        setJobsMap(prev => ({ ...prev, [String(job.job_id || job.job_ref || job.id)]: job, [String(job.id)]: job }))
      } catch (e) {
        // ignore
      }
    })()
    return () => { mounted = false }
  }, [expandedId, rows, jobsMap])

  return (
    <div className="container">
      <h2>Candidates</h2>
      <div className="toolbar candidates-toolbar" style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div className="search-box">
          <span>🔍</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, location, or job id (e.g. job-4)…" />
        </div>
        <div className={`filter-menu ${openFilter === 'status' ? 'open' : ''}`}>
          <button type="button" className="filter-summary" onClick={() => toggleFilterMenu('status')}>{statusFilterLabel}</button>
          {openFilter === 'status' && <div className="filter-menu-panel">
            {STATUS_OPTIONS.map(k => (
              <label key={k} className="filter-check">
                <input type="checkbox" checked={statusFilters.includes(k)} onChange={() => toggleFilterValue(statusFilters, k, setStatusFilters)} />
                <span>{STATUS_LABEL[k]}</span>
              </label>
            ))}
          </div>}
        </div>
        <div className={`filter-menu ${openFilter === 'sort' ? 'open' : ''}`}>
          <button type="button" className="filter-summary" onClick={() => toggleFilterMenu('sort')}>{sortFilterLabel}</button>
          {openFilter === 'sort' && <div className="filter-menu-panel">
            {SORT_OPTIONS.map(k => (
              <label key={k} className="filter-check">
                <input type="checkbox" checked={sortFields.includes(k)} onChange={() => toggleSortValue(k)} />
                <span>{SORT_LABEL[k]}</span>
              </label>
            ))}
          </div>}
        </div>
        <div className={`filter-menu ${openFilter === 'role' ? 'open' : ''}`}>
          <button type="button" className="filter-summary" onClick={() => toggleFilterMenu('role')}>{roleFilterLabel}</button>
          {openFilter === 'role' && <div className="filter-menu-panel">
            {roles.map(r => (
              <label key={r} className="filter-check">
                <input type="checkbox" checked={selectedRoles.includes(r)} onChange={() => toggleFilterValue(selectedRoles, r, setSelectedRoles)} />
                <span>{r}</span>
              </label>
            ))}
          </div>}
        </div>
        <button className="btn btn-ghost" onClick={() => { setSearch(''); setStatusFilters([]); setSortFields(['date_desc']); setSelectedRoles([]) }}>Clear</button>
      </div>

      {isLoading && <div className="card">Loading...</div>}

      {/* Toasts shown via ToastProvider */}

      {/* Upload modal */}
      <div className={`overlay ${showUpload ? 'open' : ''}`} onClick={() => setShowUpload(false)} />
      <div className={`modal ${showUpload ? 'open' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div>
            <h2 id="drawerTitle">Upload CSV / Excel</h2>
            <div className="sub">Upload workbook(s) to add candidates</div>
          </div>
          <button className="drawer-close" onClick={() => setShowUpload(false)}>✕</button>
        </div>
        <div className="drawer-body">
          <FileUpload onFile={async (file: File) => {
            try {
              const { rows: rowsFlat, errors } = await parseCSVFile(file)
              if (!rowsFlat.length) { addToast('No rows parsed', 'error'); return }
              try {
                const inserted = await CandidateService.createMany(rowsFlat)
                const newRows = inserted.map((p: any) => ({
                  id: p.id,
                  name: p.name,
                  email: p.email,
                  phone: p.phone,
                  exp: p.experience ? String(p.experience) : '',
                  cctc: p.current_ctc ? String(p.current_ctc) : '',
                  ectc: p.expected_ctc ? String(p.expected_ctc) : '',
                  location: p.current_location || '',
                  np: p.notice_period || '',
                  selstatus: p.selstatus || 'progress',
                  role: p.job_role || p.role || '',
                  linkedin: p.linkedin || '',
                  created_at: p.created_at,
                  updated_at: p.updated_at
                }))
                // prepend imported rows so newest appear on top
                setRows(prev => [...newRows, ...prev])
                if (errors && errors.length) console.debug('CSV parse errors', errors)
                addToast(`Imported ${newRows.length} candidates`, 'success')
              } catch (err) {
                addToast('Import failed', 'error')
              }
              setShowUpload(false)
            } catch (e) {
              addToast('Import failed', 'error')
            }
          }} />
        </div>
      </div>

      {!isLoading && (
        <div className="card candidates-card" style={{ marginBottom: 12 }} onClick={() => setOpenFilter(null)}>
          <div className="candidates-card-head">
            <h3>{candidateListTitle} ({filteredRows.length})</h3>
            <div className="candidates-card-actions">
              <button className="btn btn-ghost" onClick={exportCSV}>Export CSV</button>
              {!isClient && <button className="btn btn-ghost" onClick={downloadSampleCSV}>Download sample CSV</button>}
              {!isClient && <button className="btn btn-ghost" onClick={downloadSampleExcel}>Download sample Excel</button>}
              {!isClient && (
                    <>
                      <button className="btn btn-ghost" onClick={() => setShowUpload(true)}>Upload CSV/Excel</button>
                      <button className="btn btn-primary" onClick={() => {
                        setEditingId(null)
                        setForm({ role: '', name: '', date: new Date().toISOString().slice(0, 10), exp: '', cctc: '', ectc: '', email: '', phone: '', linkedin: '', location: '', np: '', availability: '', intstatus: '', selstatus: 'progress', remarks: '', f2f: '' })
                        setDrawerOpen(true)
                      }}>+ Add Candidate</button>
                    </>
                  )}
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <colgroup>
                <col className="check-col" />
                <col className="candidate-col" />
                <col className="experience-col" />
                <col className="ctc-col" />
                <col className="location-col" />
                <col className="notice-col" />
                <col className="status-col" />
                <col className="actions-col" />
              </colgroup>
              <thead>
                <tr>
                  <th className="check-col"><input type="checkbox" onChange={(e) => { if (e.target.checked) setSelectedIds(filteredRows.map((c:any)=>c.id)); else setSelectedIds([]) }} checked={filteredRows.length>0 && filteredRows.every((c:any)=>selectedIds.includes(c.id))} /></th>
                  <th>Candidate</th>
                  <th className="experience-col">Experience</th>
                  <th>C‑CTC / E‑CTC</th>
                  <th>Location</th>
                  <th className="notice-col">Notice Period</th>
                  <th className="status-th">Status</th>
                  {!isClient && <th className="actions-th">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((c: any) => {
                  const stageIdx = STAGE_ORDER.indexOf(c.selstatus)
                  const isSelected = selectedIds.includes(c.id)
                  return (
                    <React.Fragment key={c.id}>
                      <tr className={`${isSelected ? 'row-selected ' : ''}candidate-click-row ${statusMenuFor === c.id ? 'status-menu-open' : ''}`} onClick={() => { setOpenFilter(null); setStatusMenuFor(null); toggleExpanded(c.id) }}>
                        <td className="check-col" onClick={(e)=>e.stopPropagation()}><input type="checkbox" checked={isSelected} onChange={(e)=>{
                              setSelectedIds(prev=> e.target.checked ? [...new Set([...prev,c.id])] : prev.filter(x=>x!==c.id))
                            }} /></td>
                        <td>
                          <div className="cand-name">{c.name}</div>
                          <div className="cand-sub">{c.email}</div>
                        </td>
                        <td className="experience-col">{formatExperience(c.exp)}</td>
                        <td className="mono">
                          <div className="ctc-cell">
                            <span>{formatCtc(c.cctc)} → {formatCtc(c.ectc)}</span>
                            {hikeLabel(c.cctc, c.ectc) && <span className="hike-badge">Hike: {hikeLabel(c.cctc, c.ectc)}</span>}
                          </div>
                        </td>
                        <td>{formatLocation(c.location)}</td>
                        <td className="notice-col">{formatNoticePeriod(c.np)}</td>
                        <td className="status-cell" onClick={(e)=>e.stopPropagation()}>
                          <div className="status-cell-inner">
                            <span className={`badge ${normalizedStatus(c.selstatus)}`} style={{ cursor: 'pointer' }} onClick={()=>{ setExpandedId(null); setStatusMenuFor(statusMenuFor === c.id ? null : c.id) }} title="Click to change status">{statusLabel(c.selstatus)}</span>
                          </div>
                          {statusMenuFor === c.id && (
                            <div className="status-menu">
                              {STATUS_OPTIONS.map((k)=> (
                                <div key={k} className={`status-menu-item ${normalizedStatus(c.selstatus) === k ? 'active' : ''}`} onClick={()=>{
                                  const prev = c.selstatus
                                  setRows(prevRows => {
                                    const updatedRow = { ...c, selstatus: k, updated_at: new Date().toISOString() }
                                    return [updatedRow, ...prevRows.filter(rw => rw.id !== c.id)]
                                  })
                                  setLastChange({id:c.id, prev})
                                  addToast('Status updated — Undo?', 'info', 3000)
                                  setStatusMenuFor(null)
                                }}>{STATUS_LABEL[k]}</div>
                              ))}
                            </div>
                          )}
                        </td>
                        {!isClient && (
                        <td className="actions-cell" onClick={(e)=>e.stopPropagation()}>
                          <div className="row-actions" style={{ display: 'flex' }}>
                            <div className="icon-btn edit" title="Edit" onClick={() => { setEditingId(String(c.id)); setForm({ ...c }); setDrawerOpen(true) }}><FaPen /></div>
                            <div className="icon-btn del" title="Delete" onClick={async () => {
                              if (!confirm('Delete this candidate?')) return
                              try {
                                const ok = await CandidateService.remove(String(c.id))
                                if (ok) {
                                  setRows(prev=>prev.filter(x=>x.id!==c.id))
                                  addToast('Candidate deleted', 'success')
                                } else {
                                  addToast('Delete failed: no rows deleted', 'error')
                                }
                              } catch (err: any) {
                                const msg = err?.message || String(err)
                                addToast('Delete failed: ' + msg, 'error')
                              }
                            }}><FaTrashAlt /></div>
                          </div>
                        </td>
                        )}
                      </tr>
                      {expandedId === c.id && (
                        <tr className="expanded-row">
                          <td colSpan={isClient ? 7 : 8}>
                            <div className="candidate-profile-panel">
                              <div className="candidate-profile-head">
                                <div className="candidate-profile-identity">
                                  <div className="candidate-avatar">{display(c.name).slice(0, 1).toUpperCase()}</div>
                                  <div>
                                    <div className="candidate-profile-name">{display(c.name)}</div>
                                    
                                       <div style={{ marginTop: 6, display: 'flex', gap: 16, alignItems: 'center' }}>
                                         <div style={{ fontSize: 13 }}><strong>Job Role:</strong> <span style={{ marginLeft: 6 }}>{display(c.applied_job_title || c.role || '-')}</span></div>
                                         <div style={{ fontSize: 13 }}>
                                           <strong>Job ID:</strong>
                                           <span style={{ marginLeft: 6 }}>
                                             {(() => {
                                               const key = String(c.applied_job_id || c.job_id || c.job_ref || '')
                                               const job = jobsMap[key]
                                               if (job && job.job_id) return String(job.job_id)
                                               // fallback to applied_job_id if present
                                               return display(c.applied_job_id || c.job_id || '-')
                                             })()}
                                           </span>
                                         </div>
                                       </div>
                                  </div>
                                </div>
                                <span className={`badge ${normalizedStatus(c.selstatus)}`}>{statusLabel(c.selstatus)}</span>
                              </div>

                              <div className="candidate-profile-grid">
                                <div className="profile-field">
                                  <FaEnvelope />
                                  <div>
                                    <label>Email</label>
                                    <div>{display(c.email)}</div>
                                  </div>
                                </div>
                                <div className="profile-field">
                                  <FaPhoneAlt />
                                  <div>
                                    <label>Phone</label>
                                    <div>{display(c.phone)}</div>
                                  </div>
                                </div>
                                <div className="profile-field">
                                  <FaLinkedin />
                                  <div>
                                    <label>LinkedIn</label>
                                    <div className="profile-link">{display(c.linkedin)}</div>
                                  </div>
                                </div>
                                <div className="profile-field">
                                  <FaMapMarkerAlt />
                                  <div>
                                    <label>Location</label>
                                    <div>{formatLocation(c.location)}</div>
                                  </div>
                                </div>
                                <div className="profile-field">
                                  <FaCalendarAlt />
                                  <div>
                                    <label>Availability</label>
                                    <div>{display(c.availability)}</div>
                                  </div>
                                </div>
                                <div className="profile-field">
                                  <FaClock />
                                  <div>
                                    <label>Notice period</label>
                                    <div>{formatNoticePeriod(c.np)}</div>
                                  </div>
                                </div>
                                <div className="profile-field">
                                  <FaBriefcase />
                                  <div>
                                    <label>Experience</label>
                                    <div>{formatExperience(c.exp)}</div>
                                  </div>
                                </div>
                                
                                <div className="profile-field">
                                  <FaMoneyBillWave />
                                  <div>
                                    <label>Compensation</label>
                                    <div className="compensation-value">
                                      <span>{formatCtc(c.cctc)} → {formatCtc(c.ectc)}</span>
                                      {hikeLabel(c.cctc, c.ectc) && <span className="hike-badge">Hike: {hikeLabel(c.cctc, c.ectc)}</span>}
                                    </div>
                                  </div>
                                </div>
                              </div>

                              <div className="candidate-notes-grid">
                                <div className="candidate-note-card">
                                  <div className="note-card-head"><FaUserCheck /><label>Interview notes</label></div>
                                  <p>{display(c.intstatus)}</p>
                                </div>
                                <div className="candidate-note-card">
                                  <div className="note-card-head"><FaStickyNote /><label>Remarks</label></div>
                                  <div style={{ whiteSpace: 'pre-wrap' }}>{c.remarks || '-'}</div>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
                {filteredRows.length === 0 && (
                  <tr><td colSpan={isClient ? 7 : 8} style={{ textAlign: 'center', padding: 24 }}>No candidates found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Candidate add/edit drawer */}
      <div className={`overlay ${drawerOpen ? 'open' : ''}`} onClick={() => { setDrawerOpen(false); setEditingId(null) }} />
      <div className={`modal ${drawerOpen ? 'open' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div>
            <h2 id="drawerTitle">{editingId ? 'Edit Candidate' : 'Add Candidate'}</h2>
            <div className="sub">{form.role || 'Unassigned'}</div>
          </div>
          <button className="drawer-close" onClick={() => { setDrawerOpen(false); setEditingId(null) }}>✕</button>
        </div>
        <CandidateForm
          form={form}
          setForm={setForm}
          importPreview={importPreview}
          importErrors={importErrors}
          handleExcelFile={async (file: File) => {
            try {
              const { rows: rowsFlat, errors } = await parseCSVFile(file)
              setImportPreview(rowsFlat)
              setImportErrors(errors || [])
              if (rowsFlat.length) {
                const p = rowsFlat[0]
                setForm({
                  role: p.job_role || p.role || '',
                  name: p.name || '',
                  date: new Date().toISOString().slice(0, 10),
                  exp: p.experience ? String(p.experience) : '',
                  cctc: p.current_ctc ? String(p.current_ctc) : '',
                  ectc: p.expected_ctc ? String(p.expected_ctc) : '',
                  email: p.email || '',
                  phone: p.phone || '',
                  linkedin: p.linkedin || '',
                  location: p.current_location || '',
                  np: p.notice_period || '',
                  availability: p.availability || '',
                  intstatus: p.intstatus || '',
                  selstatus: p.selstatus || 'progress',
                  remarks: p.remarks || '',
                  f2f: p.f2f || ''
                })
                addToast('Form populated from CSV (first row)', 'info', 1500)
              }
            } catch (e) {
              addToast('Import failed', 'error')
            }
          }}
          importParsedRows={async () => {
            if (!importPreview.length) return
            try {
              const inserted = await CandidateService.createMany(importPreview)
              const newRows = inserted.map((p: any) => ({ id: p.id, name: p.name, email: p.email, phone: p.phone, exp: p.experience ? String(p.experience) : '', cctc: p.current_ctc ? String(p.current_ctc) : '', ectc: p.expected_ctc ? String(p.expected_ctc) : '', location: p.current_location || '', np: p.notice_period || '', selstatus: p.selstatus || 'progress', role: p.job_role || p.role || '', linkedin: p.linkedin || '', created_at: p.created_at, updated_at: p.updated_at }))
              setRows(prev => [...newRows, ...prev])
              addToast(`Imported ${newRows.length} candidates`, 'success')
              setImportPreview([])
              setImportErrors([])
              setDrawerOpen(false)
            } catch (e) { addToast('Import failed', 'error') }
          }}
          onClearImport={() => { setImportPreview([]); setImportErrors([]) }}
          onCancel={() => { setDrawerOpen(false); setEditingId(null) }}
          onSave={async (updatedForm?: any) => {
            const effectiveForm = updatedForm || form
            try {
              if (editingId) {
                const updated = await CandidateService.update(String(editingId), effectiveForm)
                if (!updated) { addToast('Update did not affect any row', 'error'); return }
                setRows(prev => {
                  const merged = { ...prev.find(r => String(r.id) === String(editingId)), ...updated, updated_at: updated.updated_at || new Date().toISOString() }
                  return [merged, ...prev.filter(r => String(r.id) !== String(editingId))]
                })
                addToast('Candidate updated', 'success')
              } else {
                const created = await CandidateService.create(effectiveForm)
                setRows(prev => [created, ...prev])
                addToast('Candidate added', 'success')
              }
              setDrawerOpen(false)
              setEditingId(null)
            } catch (e: any) { addToast('Save failed: ' + (e?.message || String(e)), 'error') }
          }}
          editingId={editingId}
        />
      </div>
    </div>
  )
}
