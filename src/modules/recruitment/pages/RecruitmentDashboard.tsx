import React, { useMemo, useState, useEffect } from 'react'
import '../../../styles/staHR.css'
import { useLocation } from 'react-router-dom'
import FileUpload from '../../../components/FileUpload'
import CandidateForm from '../components/CandidateForm'
import { parseCSVFile } from '../../../utils/csvUtils'
import { Candidate } from '../../../types'
import { CandidateService } from '../services/candidateService'
import { useToast } from '../../../components/ToastProvider'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Tooltip,
  Legend
} from 'chart.js'
import { Bar, Doughnut } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend)

export default function RecruitmentDashboard() {
  const location = useLocation()
  const [data, setData] = useState<Candidate[] | any[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [sortField, setSortField] = useState('date_desc')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<any>({})
  const [importPreview, setImportPreview] = useState<any[]>([])
  const [importErrors, setImportErrors] = useState<any[]>([])
  const addToast = useToast()

  const normalizedStatus = (status: any) => {
    const s = String(status || 'progress').toLowerCase()
    if (s.includes('reject')) return 'rejected'
    if (s.includes('select') || s.includes('offer')) return 'selected'
    if (s.includes('hold')) return 'hold'
    if (s.includes('drop')) return 'dropped'
    return 'progress'
  }

  const allRoleRows = useMemo(() => data, [data])

  const filteredRows = useMemo(() => {
    let rows = data.slice()
    if (roleFilter) rows = rows.filter((d: any) => (d.role || '').toString() === roleFilter)
    if (search) rows = rows.filter((d: any) => (d.name + d.email + d.location).toLowerCase().includes(search.toLowerCase()))
    if (statusFilter) rows = rows.filter((d: any) => normalizedStatus(d.selstatus) === statusFilter)
    rows = rows.slice().sort((a: any, b: any) => {
      if (sortField === 'date_desc') return b.date.localeCompare(a.date)
      if (sortField === 'date_asc') return a.date.localeCompare(b.date)
      if (sortField === 'name_asc') return a.name.localeCompare(b.name)
      if (sortField === 'exp_desc') return parseFloat(b.exp) - parseFloat(a.exp)
      return 0
    })
    return rows
  }, [data, search, statusFilter, sortField, roleFilter])

  const stats = useMemo(() => {
    const c: any = { selected: 0, rejected: 0, hold: 0, progress: 0, dropped: 0 }
    allRoleRows.forEach((r: any) => {
      const status = normalizedStatus(r.selstatus)
      c[status] = (c[status] || 0) + 1
    })
    return c
  }, [allRoleRows])

  function selectRole(r: string) {
    // roles are managed in recruitment candidates page; keep stub here
  }

  useEffect(() => {
    // intentionally left blank: dashboard shows all candidates
  }, [location.search])

  // fetch candidates from Supabase on mount
  useEffect(() => {
    ;(async () => {
      try {
        const { data: fetched } = await CandidateService.list(1, 1000)
        setData(fetched || [])
      } catch (e) {
        console.error('Failed to load candidates', e)
        setData([])
        addToast('Failed to load candidates', 'error')
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function openDrawer(id?: string) {
    const isEdit = typeof id !== 'undefined' && id !== null
    setEditingId(isEdit ? id! : null)
    const row = isEdit ? data.find((d: any) => String(d.id) === String(id)) : { role: '', name: '', date: new Date().toISOString().slice(0, 10), exp: '', cctc: '', ectc: '', email: '', phone: '', linkedin: '', location: '', np: '', availability: '', intstatus: '', selstatus: 'progress', remarks: '', f2f: '' }
    setForm({ ...row })
    setDrawerOpen(true)
  }

  useEffect(() => {
    try {
      const p = new URLSearchParams(location.search).get('openAdd')
      if (p === 'true') {
        setEditingId(null)
        setForm({ role: '', name: '', date: new Date().toISOString().slice(0, 10), exp: '', cctc: '', ectc: '', email: '', phone: '', linkedin: '', location: '', np: '', availability: '', intstatus: '', selstatus: 'progress', remarks: '', f2f: '' })
        setDrawerOpen(true)
      }
    } catch (e) {
      // ignore
    }
  }, [location.search])

  useEffect(() => {
    try {
      const r = new URLSearchParams(location.search).get('role')
      if (r) setRoleFilter(r)
    } catch (e) {
      // ignore
    }
  }, [location.search])

  useEffect(() => {
    try {
      const q = new URLSearchParams(location.search).get('openEdit')
      if (q) {
        const row = data.find((d: any) => String(d.id) === String(q))
        if (row) {
          setEditingId(q)
          setForm({ ...row })
          setDrawerOpen(true)
        }
      }
    } catch (e) {
      // ignore
    }
  }, [location.search, data])

  async function handleExcelFile(file: File) {
    const { rows, errors } = await parseCSVFile(file)
    setImportPreview(rows)
    setImportErrors(errors || [])
    // Auto-fill add-candidate form with first parsed row
    if (rows.length > 0) {
      const p = rows[0]
      setEditingId(null)
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
  }

  function importParsedRows() {
    if (!importPreview.length) return
    ;(async () => {
      try {
        const inserted = await CandidateService.createMany(importPreview)
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
          linkedin: p.linkedin || ''
        }))
        setData((prev: any[]) => [...newRows, ...prev])
        addToast(`Imported ${newRows.length} candidates`, 'success')
        setImportPreview([])
        setImportErrors([])
        setDrawerOpen(false)
      } catch (e) {
        addToast('Import failed', 'error')
      }
    })()
  }

  function closeDrawer() {
    setDrawerOpen(false)
    setEditingId(null)
  }

  function saveCurrent(updatedForm?: any) {
    ;(async () => {
      try {
        const effectiveForm = updatedForm || form
        if (editingId) {
          try { console.debug('Saving update', { editingId, form: effectiveForm }) } catch (e) {}
          const updated = await CandidateService.update(String(editingId), effectiveForm)
          if (!updated) {
            alert('Update did not affect any row. It may be a permissions issue or the record no longer exists. Reloading list.')
            const { data: fetched } = await CandidateService.list(1, 1000)
            setData(fetched || [])
            closeDrawer()
            return
          }
          setData((prev: any[]) => prev.map((d) => (String(d.id) === String(editingId) ? { ...d, ...updated } : d)))
          addToast('Candidate updated', 'success')
        } else {
          const created = await CandidateService.create(effectiveForm)
          setData((prev: any[]) => [created, ...prev])
          addToast('Candidate added', 'success')
        }
        closeDrawer()
      } catch (e: any) {
        const msg = e?.message || String(e)
        addToast('Save failed: ' + msg, 'error')
      }
    })()
  }

  function deleteCurrent() {
    if (!editingId) return
    if (confirm('Delete this candidate record? This cannot be undone.')) {
      ;(async () => {
        try {
          const ok = await CandidateService.remove(String(editingId))
          if (ok) {
            setData((prev: any[]) => prev.filter((d) => d.id !== editingId))
            addToast('Candidate deleted', 'success')
            closeDrawer()
          } else {
            addToast('Delete failed: no rows deleted', 'error')
          }
        } catch (e) {
          const msg = (e as any)?.message || String(e)
          addToast('Delete failed: ' + msg, 'error')
        }
      })()
    }
  }

  function quickDelete(id: string) {
    if (confirm('Delete this candidate record? This cannot be undone.')) {
      ;(async () => {
        try {
          const ok = await CandidateService.remove(String(id))
          if (ok) setData((prev: any[]) => prev.filter((d) => d.id !== id))
          else addToast('Delete failed: no rows deleted', 'error')
        } catch (e) {
          const msg = (e as any)?.message || String(e)
          addToast('Delete failed: ' + msg, 'error')
        }
      })()
    }
  }

  function cycleStatus(id: string) {
    const ORDER = ['progress', 'hold', 'selected', 'rejected', 'dropped']
    setData((prev: any[]) => prev.map((d) => {
      if (String(d.id) !== String(id)) return d
      const idx = ORDER.indexOf(normalizedStatus(d.selstatus))
      const next = ORDER[(idx + 1) % ORDER.length]
      return { ...d, selstatus: next }
    }))
    addToast(`Status updated`, 'info')
  }

  const STAGE_ORDER = ['progress', 'hold', 'selected']
  const STATUS_LABEL: any = { selected: 'Selected', rejected: 'Rejected', hold: 'On hold', progress: 'In progress', dropped: 'Dropped out' }
  const STATUS_COLORS: Record<string, string> = {
    rejected: '#EF4444', // red
    selected: '#22C55E', // green
    progress: '#F59E0B', // yellow / orange
    hold: '#38BDF8',     // blue
    dropped: '#64748B'   // gray
  }

  const charts = useMemo(() => {
    const rows = filteredRows || []
    const expBuckets: Record<string, number> = { '0-2': 0, '2-5': 0, '5-8': 0, '8-12': 0, '12+': 0 }
    const statusCounts: Record<string, number> = {}
    const skillsCount: Record<string, number> = {}
    const locCounts: Record<string, number> = {}

    rows.forEach((r: any) => {
      const expSrc = r.exp ?? r.experience ?? ''
      const m = String(expSrc).match(/[\d.]+/)
      const years = m ? parseFloat(m[0]) : NaN
      if (!Number.isNaN(years)) {
        if (years < 2) expBuckets['0-2']++
        else if (years < 5) expBuckets['2-5']++
        else if (years < 8) expBuckets['5-8']++
        else if (years < 12) expBuckets['8-12']++
        else expBuckets['12+']++
      }

      const st = normalizedStatus(r.selstatus)
      statusCounts[st] = (statusCounts[st] || 0) + 1

      const skillsRaw = r.skills || r.tags || ''
      if (skillsRaw) {
        String(skillsRaw).split(/[,;|]/).map(s => s.trim()).filter(Boolean).forEach((sk: string) => {
          skillsCount[sk] = (skillsCount[sk] || 0) + 1
        })
      }

      const loc = r.location || r.current_location || 'Unknown'
      locCounts[loc] = (locCounts[loc] || 0) + 1
    })

    const topSkills = Object.entries(skillsCount).sort((a: any, b: any) => b[1] - a[1]).slice(0, 6)

    return { expBuckets, statusCounts, topSkills, locCounts }
  }, [filteredRows])

  return (
    <div className="container">
      <div className="topbar" style={{ alignItems: 'center' }}>
        <div>
          <h1 id="pageTitle">Recruitment Dashboard</h1>
          <p id="pageSub">Submissions and interview pipeline overview</p>
        </div>
      </div>

      <div className="kpi-grid" style={{ marginBottom: 18 }}>
        <div className="stat-card kpi">
          <div className="kpi-left"><div className="num">{allRoleRows.length}</div><div className="label">Total Candidates</div></div>
          <div className="kpi-right">📥</div>
        </div>
        <div className="stat-card kpi selected">
          <div className="kpi-left"><div className="num">{stats.selected}</div><div className="label">Selected</div></div>
          <div className="kpi-right">✅</div>
        </div>
        <div className="stat-card kpi progress">
          <div className="kpi-left"><div className="num">{stats.progress + stats.hold}</div><div className="label">In Pipeline</div></div>
          <div className="kpi-right">🔄</div>
        </div>
        <div className="stat-card kpi rejected">
          <div className="kpi-left"><div className="num">{stats.rejected + stats.dropped}</div><div className="label">Closed Out</div></div>
          <div className="kpi-right">❌</div>
        </div>
      </div>

      

      <div className="dashboard-grid">
        <div style={{ flex: 1 }}>
          <div className="charts-grid">
            <div className="chart-card">
              <div className="card-header">
                <div><strong>Experience Mix</strong><div className="card-sub">Distribution by tenure</div></div>
                <div className="chip">{Object.values(charts.expBuckets).reduce((s,n)=>s+n,0)}</div>
              </div>
              <div style={{ marginTop: 12, height: 220 }}>
                <Bar
                  data={{
                    labels: Object.keys(charts.expBuckets).map(l => l.replace('-', '–')),
                    datasets: [
                      {
                        label: 'Candidates',
                        data: Object.values(charts.expBuckets),
                        backgroundColor: 'rgba(30,58,138,0.8)'
                      }
                    ]
                  }}
                  options={{
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: { y: { beginAtZero: true } }
                  }}
                />
              </div>
            </div>

            <div className="chart-card">
              <div className="card-header">
                <div><strong>Status Distribution</strong><div className="card-sub">Pipeline outcomes</div></div>
                <div className="chip">{Object.values(charts.statusCounts).reduce((s,n)=>s+n,0)}</div>
              </div>
              <div style={{ marginTop: 12, height: 200 }}>
                <Doughnut
                  data={{
                    labels: Object.keys(charts.statusCounts).map(k => STATUS_LABEL[k] ?? k),
                    datasets: [
                      {
                        data: Object.values(charts.statusCounts),
                        backgroundColor: Object.keys(charts.statusCounts).map((k: string) => STATUS_COLORS[k] || '#94A3B8')
                      }
                    ]
                  }}
                  options={{ maintainAspectRatio: false }}
                />
              </div>
            </div>

            <div className="chart-card full-width">
              <div className="card-header">
                <div><strong>Location Coverage</strong><div className="card-sub">Candidate concentration by city</div></div>
                <div className="chip">{Object.keys(charts.locCounts).length}</div>
              </div>
              <div style={{ marginTop: 12, height: 240 }}>
                <Bar
                  data={{
                    labels: Object.keys(charts.locCounts),
                    datasets: [{ label: 'Count', data: Object.values(charts.locCounts), backgroundColor: 'rgba(37,99,235,0.85)' }]
                  }}
                  options={{
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: { y: { beginAtZero: true } }
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Toasts rendered by ToastProvider */}

      <div className={`overlay ${drawerOpen ? 'open' : ''}`} onClick={closeDrawer} />
      <div className={`modal ${drawerOpen ? 'open' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div>
            <h2 id="drawerTitle">{editingId ? 'Edit Candidate' : 'Add Candidate'}</h2>
            <div className="sub">{form.role || 'Unassigned'}</div>
          </div>
          <button className="drawer-close" onClick={closeDrawer}>✕</button>
        </div>
        <CandidateForm
          form={form}
          setForm={setForm}
          importPreview={importPreview}
          importErrors={importErrors}
          handleExcelFile={handleExcelFile}
          importParsedRows={importParsedRows}
          onClearImport={() => { setImportPreview([]); setImportErrors([]) }}
          onCancel={closeDrawer}
          onSave={saveCurrent}
          editingId={editingId}
        />
      </div>
    </div>
  )
}
