import React, { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  PointElement,
  LineElement,
  Tooltip,
  Legend
} from 'chart.js'
import { Bar, Doughnut, Line } from 'react-chartjs-2'
import CandidateForm from '../components/CandidateForm'
import { parseCSVFile } from '../../../utils/csvUtils'
import { CandidateService } from '../services/candidateService'
import { useToast } from '../../../components/ToastProvider'
import { useRecruitmentDashboard } from '../hooks/useRecruitmentDashboard'
import '../../../styles/staHR.css'

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, PointElement, LineElement, Tooltip, Legend)

type StatusKey = 'selected' | 'rejected' | 'hold' | 'progress' | 'dropped'

type DashboardFilters = {
  dateFrom: string
  dateTo: string
  job: string
  recruiter: string
  skill: string
  experience: string
  location: string
  status: string
  stage: string
}

type UpcomingInterview = {
  id: string
  candidateName: string
  jobTitle: string
  round: string
  interviewer: string
  status: string
  timestamp: number
  whenLabel: string
}

type ActivityItem = {
  id: string
  label: string
  detail: string
  timestamp: number
}

const STATUS_LABEL: Record<StatusKey, string> = {
  selected: 'Selected',
  rejected: 'Rejected',
  hold: 'On Hold',
  progress: 'In Progress',
  dropped: 'Dropped'
}

const STATUS_COLORS: Record<StatusKey, string> = {
  selected: '#22C55E',
  rejected: '#EF4444',
  hold: '#38BDF8',
  progress: '#F59E0B',
  dropped: '#64748B'
}

const STAGE_ORDER = ['applications', 'screening', 'shortlisted', 'interview', 'final_round', 'selected'] as const
const STAGE_LABEL: Record<(typeof STAGE_ORDER)[number], string> = {
  applications: 'Applications',
  screening: 'Screening',
  shortlisted: 'Shortlisted',
  interview: 'Interview',
  final_round: 'Final Round',
  selected: 'Selected'
}

const EXPERIENCE_BUCKETS = [
  { key: '0-2', min: 0, max: 2, label: '0-2 years' },
  { key: '2-5', min: 2, max: 5, label: '2-5 years' },
  { key: '5-8', min: 5, max: 8, label: '5-8 years' },
  { key: '8-12', min: 8, max: 12, label: '8-12 years' },
  { key: '12+', min: 12, max: Number.POSITIVE_INFINITY, label: '12+ years' }
]

function normalizedStatus(raw: any): StatusKey {
  const value = String(raw || '').toLowerCase()
  if (value.includes('select') || value.includes('offer')) return 'selected'
  if (value.includes('reject')) return 'rejected'
  if (value.includes('hold')) return 'hold'
  if (value.includes('drop')) return 'dropped'
  return 'progress'
}

function toEpoch(value: any): number | null {
  if (!value) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'object') {
    const date = String((value.date || '')).slice(0, 10)
    const time = String(value.start_time || value.time || '09:00').replace(/\s*(AM|PM)$/i, '')
    if (date) {
      const parsed = Date.parse(`${date}T${time}:00`)
      return Number.isNaN(parsed) ? null : parsed
    }
    const displayParsed = Date.parse(String(value.display || ''))
    return Number.isNaN(displayParsed) ? null : displayParsed
  }
  const text = String(value).trim()
  if (!text) return null
  const parsed = Date.parse(text)
  return Number.isNaN(parsed) ? null : parsed
}

function toIsoDate(value: any): string {
  const ts = toEpoch(value)
  if (ts == null) return ''
  return new Date(ts).toISOString().slice(0, 10)
}

function parseYears(raw: any): number | null {
  const text = String(raw ?? '').replace(/,/g, ' ')
  const match = text.match(/\d+(\.\d+)?/)
  if (!match) return null
  const n = parseFloat(match[0])
  return Number.isNaN(n) ? null : n
}

function normalizeLocation(raw: any): string {
  const text = String(raw || '').trim()
  if (!text) return 'Unknown'
  const compact = text.replace(/\s+/g, ' ').replace(/[,./-]+$/g, '')
  return compact
    .toLowerCase()
    .split(' ')
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(' ')
}

function splitSkills(row: Record<string, any>): string[] {
  const source = row.skills || row.tags || row.technical_skills || ''
  return String(source)
    .split(/[,;|/]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function inferSource(row: Record<string, any>): string {
  const raw = row.source || row.candidate_source || row.application_source || row.channel || ''
  const value = String(raw).trim().toLowerCase()
  if (!value) return ''
  if (value.includes('linkedin')) return 'LinkedIn'
  if (value.includes('naukri')) return 'Naukri'
  if (value.includes('referral')) return 'Employee Referral'
  if (value.includes('website') || value.includes('career')) return 'Company Website'
  if (value.includes('indeed')) return 'Indeed'
  return 'Other'
}

function inferStage(row: Record<string, any>): (typeof STAGE_ORDER)[number] {
  const status = normalizedStatus(row.selstatus)
  const intStatus = String(row.intstatus || '').toLowerCase()
  if (status === 'selected') return 'selected'
  if (intStatus.includes('final')) return 'final_round'
  if (intStatus.includes('interview') || row.interview_slot || row.confirmed_availability || row.f2f) return 'interview'
  if (intStatus.includes('shortlist')) return 'shortlisted'
  if (intStatus.includes('screen')) return 'screening'
  if (status === 'hold') return 'screening'
  return 'applications'
}

function getRecruiter(row: Record<string, any>): string {
  return String(row.recruiter || row.recruiter_name || row.owner || '').trim()
}

function splitJobSkills(job: Record<string, any>): string[] {
  const raw = [job.technical_skills, job.preferred_skills, job.primarySkills, job.secondarySkills]
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .filter(Boolean)

  return raw
    .flatMap((value) => String(value)
      .split(/[,;|/]/)
      .map((part) => part.trim())
      .filter(Boolean))
}

function formatDateTime(epoch: number): string {
  try {
    return new Date(epoch).toLocaleString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch (e) {
    return new Date(epoch).toISOString()
  }
}

export default function RecruitmentDashboard() {
  const location = useLocation()
  const navigate = useNavigate()
  const addToast = useToast()
  const { candidates, jobs, isLoading, error } = useRecruitmentDashboard()

  const [rows, setRows] = useState<Record<string, any>[]>([])
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<Record<string, any>>({})
  const [importPreview, setImportPreview] = useState<Record<string, any>[]>([])
  const [importErrors, setImportErrors] = useState<Record<string, any>[]>([])
  const [showAllSkills, setShowAllSkills] = useState(false)

  const [filters, setFilters] = useState<DashboardFilters>({
    dateFrom: '',
    dateTo: '',
    job: '',
    recruiter: '',
    skill: '',
    experience: '',
    location: '',
    status: '',
    stage: ''
  })

  useEffect(() => {
    setRows(candidates || [])
  }, [candidates])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const role = params.get('role') || ''
    if (role) setFilters((prev) => ({ ...prev, job: role }))

    const openAdd = params.get('openAdd')
    if (openAdd === 'true') {
      setEditingId(null)
      setForm({
        role: '',
        name: '',
        date: new Date().toISOString().slice(0, 10),
        exp: '',
        cctc: '',
        ectc: '',
        email: '',
        phone: '',
        linkedin: '',
        location: '',
        np: '',
        availability: '',
        intstatus: '',
        selstatus: 'progress',
        remarks: '',
        f2f: ''
      })
      setDrawerOpen(true)
    }

    const openEdit = params.get('openEdit')
    if (openEdit) {
      const row = rows.find((d) => String(d.id) === String(openEdit))
      if (row) {
        setEditingId(openEdit)
        setForm({ ...row })
        setDrawerOpen(true)
      }
    }
  }, [location.search, rows])

  const jobsMap = useMemo(() => {
    const map: Record<string, Record<string, any>> = {}
    jobs.forEach((job: any) => {
      const keys = [job.id, job.job_id, job.job_ref, job.title]
        .filter(Boolean)
        .map((k) => String(k).toLowerCase())
      keys.forEach((k) => {
        map[k] = job
      })
    })
    return map
  }, [jobs])

  const normalizedRows = useMemo(() => {
    return rows.map((row) => {
      const role = String(row.role || row.job_role || row.applied_job_title || '').trim()
      const locationName = normalizeLocation(row.location || row.current_location)
      const skills = splitSkills(row)
      const stage = inferStage(row)
      const recruiter = getRecruiter(row)
      const source = inferSource(row)
      const status = normalizedStatus(row.selstatus)
      const years = parseYears(row.exp ?? row.experience)
      const interviewTs = [row.confirmed_availability, row.interview_slot, row.f2f]
        .map((v) => toEpoch(v))
        .filter((v): v is number => v != null)
        .sort((a, b) => a - b)[0] || null

      const submittedDate = toIsoDate(row.date || row.created_at)

      return {
        ...row,
        _role: role || 'Unassigned',
        _location: locationName,
        _skills: skills,
        _stage: stage,
        _recruiter: recruiter,
        _source: source,
        _status: status,
        _years: years,
        _interviewTs: interviewTs,
        _submittedDate: submittedDate
      }
    })
  }, [rows])

  const filterOptions = useMemo(() => {
    const jobsList = Array.from(new Set(normalizedRows.map((r) => r._role).filter(Boolean))).sort()
    const recruiters = Array.from(new Set(normalizedRows.map((r) => r._recruiter).filter(Boolean))).sort()
    const locations = Array.from(new Set(normalizedRows.map((r) => r._location).filter(Boolean))).sort()
    const skills = Array.from(new Set((jobs || []).flatMap((job: any) => splitJobSkills(job)))).sort((a, b) => a.localeCompare(b))
    return { jobsList, recruiters, skills, locations }
  }, [normalizedRows, jobs])

  const filteredRows: any[] = useMemo(() => {
    return normalizedRows.filter((row: any) => {
      if (filters.dateFrom && row._submittedDate && row._submittedDate < filters.dateFrom) return false
      if (filters.dateTo && row._submittedDate && row._submittedDate > filters.dateTo) return false
      if (filters.job && row._role !== filters.job) return false
      if (filters.recruiter && row._recruiter !== filters.recruiter) return false
      if (filters.skill) {
        const skillNeedle = String(filters.skill).toLowerCase()
        const directSkills = (row._skills || []).map((skill: string) => String(skill).toLowerCase())
        const rowSkillMatch = directSkills.includes(skillNeedle)
        const candidateJobKeys = [row.applied_job_id, row.job_id, row.job_ref, row._role, row.applied_job_title]
          .filter(Boolean)
          .map((value) => String(value).toLowerCase())
        const jobSkillMatch = candidateJobKeys.some((key) => {
          const job = jobsMap[key]
          if (!job) return false
          return splitJobSkills(job).some((skill) => String(skill).toLowerCase() === skillNeedle)
        })
        if (!rowSkillMatch && !jobSkillMatch) return false
      }
      if (filters.location && row._location !== filters.location) return false
      if (filters.status && row._status !== filters.status) return false
      if (filters.stage && row._stage !== filters.stage) return false
      if (filters.experience) {
        const bucket = EXPERIENCE_BUCKETS.find((b) => b.key === filters.experience)
        if (!bucket) return false
        if (row._years == null) return false
        if (row._years < bucket.min || row._years >= bucket.max) return false
      }
      return true
    })
  }, [normalizedRows, filters])

  const selectedSkillBreakdown = useMemo(() => {
    if (!filters.skill) return null
    const counts: Record<StatusKey, number> = { selected: 0, rejected: 0, hold: 0, progress: 0, dropped: 0 }
    filteredRows.forEach((row: any) => {
      counts[row._status as StatusKey] += 1
    })
    return counts
  }, [filteredRows, filters.skill])

  const analytics = useMemo(() => {
    const total = filteredRows.length
    const statusCounts: Record<StatusKey, number> = { selected: 0, rejected: 0, hold: 0, progress: 0, dropped: 0 }
    const expCounts: Record<string, number> = { '0-2': 0, '2-5': 0, '5-8': 0, '8-12': 0, '12+': 0 }
    const locCounts: Record<string, number> = {}
    const stageCounts: Record<(typeof STAGE_ORDER)[number], number> = {
      applications: 0,
      screening: 0,
      shortlisted: 0,
      interview: 0,
      final_round: 0,
      selected: 0
    }
    const sourceCounts: Record<string, number> = {}
    const sourceSelectedCounts: Record<string, number> = {}
    const skillsCounts: Record<string, number> = {}

    const jobSkills = new Map<string, Set<string>>()
    ;(jobs || []).forEach((job: any) => {
      const skillSet = new Set(splitJobSkills(job).map((skill) => skill.trim()).filter(Boolean))
      const key = String(job.id || job.job_id || job.job_ref || job.title || '').toLowerCase()
      if (key) jobSkills.set(key, skillSet)
    })

    filteredRows.forEach((row) => {
      statusCounts[row._status as StatusKey] += 1
      if (row._years != null) {
        if (row._years < 2) expCounts['0-2'] += 1
        else if (row._years < 5) expCounts['2-5'] += 1
        else if (row._years < 8) expCounts['5-8'] += 1
        else if (row._years < 12) expCounts['8-12'] += 1
        else expCounts['12+'] += 1
      }

      locCounts[row._location] = (locCounts[row._location] || 0) + 1
      stageCounts[row._stage as (typeof STAGE_ORDER)[number]] += 1

      if (row._source) {
        sourceCounts[row._source] = (sourceCounts[row._source] || 0) + 1
        if (row._status === 'selected') {
          sourceSelectedCounts[row._source] = (sourceSelectedCounts[row._source] || 0) + 1
        }
      }

      const candidateJobKeys = [row.applied_job_id, row.job_id, row.job_ref, row._role, row.applied_job_title]
        .filter(Boolean)
        .map((value) => String(value).toLowerCase())
      const matchedSkills = new Set<string>()
      candidateJobKeys.forEach((key) => {
        const fromJob = jobSkills.get(key)
        if (fromJob) {
          fromJob.forEach((skill) => matchedSkills.add(skill))
        }
      })
      matchedSkills.forEach((skill) => {
        skillsCounts[skill] = (skillsCounts[skill] || 0) + 1
      })

    })

    const topLocations = Object.entries(locCounts).sort((a, b) => b[1] - a[1]).slice(0, 10)
    const allSkills = Object.entries(skillsCounts).sort((a, b) => b[1] - a[1])
    const topSkills = allSkills.slice(0, showAllSkills ? 50 : 10)

    const sources = Object.entries(sourceCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([source, count]) => ({
        source,
        count,
        percent: total ? Math.round((count / total) * 100) : 0,
        selected: sourceSelectedCounts[source] || 0
      }))

    const interviewsScheduled = filteredRows.filter((r: any) => !!(r.interview_slot || r.confirmed_availability || r.f2f)).length
    const interviewsCompleted = filteredRows.filter((r: any) => /completed|conducted|done/i.test(String(r.intstatus || ''))).length
    const rescheduled = filteredRows.filter((r: any) => /resched/i.test(String(r.intstatus || '') + ' ' + String(r.remarks || ''))).length
    const noShows = filteredRows.filter((r: any) => /no\s*show|did not show|absent/i.test(String(r.intstatus || '') + ' ' + String(r.remarks || ''))).length

    const now = Date.now()
    const upcomingInterviews: UpcomingInterview[] = filteredRows
      .map((r) => {
        const confirmedTs = toEpoch(r.confirmed_availability)
        if (!confirmedTs || confirmedTs <= now) return null
        return {
          id: String(r.id || `${r.name}-${confirmedTs}`),
          candidateName: String(r.name || 'Candidate'),
          jobTitle: String(r._role || '-'),
          round: String(r.round || r.interview_round || r.intstatus || 'Interview'),
          interviewer: String(r.interviewer || r.interviewer_name || '-'),
          status: STATUS_LABEL[r._status as StatusKey] || 'In Progress',
          timestamp: confirmedTs,
          whenLabel: formatDateTime(confirmedTs)
        }
      })
      .filter((v): v is UpcomingInterview => v != null)
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(0, 8)

    const activities: ActivityItem[] = filteredRows
      .flatMap((r) => {
        const entries: ActivityItem[] = []
        const createdAt = toEpoch(r.created_at || r.date)
        const updatedAt = toEpoch(r.updated_at)

        if (createdAt) {
          entries.push({
            id: `${r.id}-created`,
            label: 'Candidate applied',
            detail: `${r.name || 'Candidate'} (${r._role || 'Unassigned'})`,
            timestamp: createdAt
          })
        }

        if (updatedAt && (!createdAt || updatedAt !== createdAt)) {
          entries.push({
            id: `${r.id}-updated`,
            label: `Status: ${STATUS_LABEL[r._status as StatusKey]}`,
            detail: `${r.name || 'Candidate'} updated`,
            timestamp: updatedAt
          })
        }

        if (r._interviewTs) {
          entries.push({
            id: `${r.id}-interview`,
            label: 'Interview scheduled',
            detail: `${r.name || 'Candidate'} on ${formatDateTime(r._interviewTs)}`,
            timestamp: r._interviewTs
          })
        }

        return entries
      })
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 10)

    const sourceDataAvailable = sources.length > 0

    const conversion = STAGE_ORDER.map((stage, idx) => {
      const count = stageCounts[stage] || 0
      const prev = idx === 0 ? count : stageCounts[STAGE_ORDER[idx - 1]] || 0
      const rate = idx === 0 || prev === 0 ? null : Math.round((count / prev) * 100)
      return { stage, count, rate }
    })

    const jobRows = (jobs || []).map((job: any) => {
      const jobKeySet = new Set(
        [job.id, job.job_id, job.job_ref, job.title]
          .filter(Boolean)
          .map((v) => String(v).toLowerCase())
      )

      const related = filteredRows.filter((r: any) => {
        const candidateKeys = [r.applied_job_id, r.job_id, r.job_ref, r._role]
          .filter(Boolean)
          .map((v) => String(v).toLowerCase())
        return candidateKeys.some((k) => jobKeySet.has(k))
      })

      const interviews = related.filter((r) => !!(r.interview_slot || r.confirmed_availability || r.f2f)).length
      const selected = related.filter((r) => r._status === 'selected').length

      return {
          id: String(job.id || job.job_id || job.title),
          title: String(job.title || 'Untitled Job'),
          applicants: related.length,
          interviews,
          selected,
          status: String(job.status || 'open')
        }
    })

    const anyFilterActive = Object.values(filters).some((v) => Boolean(v && String(v).trim()))
    const jobsOverview = {
      openPositions: anyFilterActive
        ? jobRows.filter((j) => String(j.status || 'Open') === 'Open' && j.applicants > 0).length
        : (jobs || []).filter((j: any) => String(j.status || 'Open') === 'Open').length,
      applications: filteredRows.length,
      positionsFilled: filteredRows.filter((r) => r._status === 'selected').length,
      positionsOnHold: anyFilterActive
        ? jobRows.filter((j) => String(j.status || '').toLowerCase().includes('hold') && j.applicants > 0).length
        : (jobs || []).filter((j: any) => String(j.status || '').toLowerCase().includes('hold')).length
    }

    const selectedDurations = filteredRows
      .filter((r) => r._status === 'selected')
      .map((r) => {
        const start = toEpoch(r.date || r.created_at)
        const end = toEpoch(r.updated_at)
        if (!start || !end || end < start) return null
        return (end - start) / (1000 * 60 * 60 * 24)
      })
      .filter((v): v is number => v != null)

    const screenDurations = filteredRows
      .map((r) => {
        const start = toEpoch(r.date || r.created_at)
        const screen = toEpoch(r.confirmed_availability || r.interview_slot)
        if (!start || !screen || screen < start) return null
        return (screen - start) / (1000 * 60 * 60 * 24)
      })
      .filter((v): v is number => v != null)

    const interviewDurations = filteredRows
      .map((r) => {
        const start = toEpoch(r.date || r.created_at)
        const interview = toEpoch(r.f2f || r.confirmed_availability || r.interview_slot)
        if (!start || !interview || interview < start) return null
        return (interview - start) / (1000 * 60 * 60 * 24)
      })
      .filter((v): v is number => v != null)

    const avg = (arr: number[]) => (arr.length ? Number((arr.reduce((sum, n) => sum + n, 0) / arr.length).toFixed(1)) : null)

    const monthlyTrend = (() => {
      const map: Record<string, number> = {}
      filteredRows.forEach((r: any) => {
        const date = toIsoDate(r.date || r.created_at)
        if (!date) return
        const month = date.slice(0, 7)
        map[month] = (map[month] || 0) + 1
      })
      return Object.entries(map)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .slice(-6)
    })()

    return {
      total,
      statusCounts,
      expCounts,
      topLocations,
      stageCounts,
      conversion,
      topSkills,
      allSkillsCount: allSkills.length,
      sources,
      sourceDataAvailable,
      interviewsScheduled,
      interviewsCompleted,
      upcomingCount: upcomingInterviews.length,
      rescheduled,
      noShows,
      upcomingInterviews,
      activities,
      jobRows,
      jobsOverview,
      avgTimeToHire: avg(selectedDurations),
      avgTimeToScreen: avg(screenDurations),
      avgTimeToInterview: avg(interviewDurations),
      monthlyTrend
    }
  }, [filteredRows, jobs, showAllSkills])

  const kpis = useMemo(() => {
    const inPipeline = analytics.statusCounts.progress + analytics.statusCounts.hold
    const closedOut = analytics.statusCounts.rejected + analytics.statusCounts.dropped

    const trend = (value: number) => {
      const current = analytics.monthlyTrend[analytics.monthlyTrend.length - 1]?.[1] || 0
      const previous = analytics.monthlyTrend[analytics.monthlyTrend.length - 2]?.[1] || 0
      if (!current || !previous) return null
      const change = Math.round(((current - previous) / Math.max(previous, 1)) * 100)
      return `${change >= 0 ? '+' : ''}${change}%`
    }

    return {
      total: { value: analytics.total, trend: trend(analytics.total) },
      selected: { value: analytics.statusCounts.selected, trend: null as string | null },
      pipeline: { value: inPipeline, trend: null as string | null },
      closedOut: { value: closedOut, trend: null as string | null }
    }
  }, [analytics])

  const handleFilterChange = (key: keyof DashboardFilters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  const clearFilters = () => {
    setFilters({
      dateFrom: '',
      dateTo: '',
      job: '',
      recruiter: '',
      skill: '',
      experience: '',
      location: '',
      status: '',
      stage: ''
    })
  }

  const navigateCandidates = (params: Record<string, string>) => {
    const query = new URLSearchParams(params)
    navigate(`/candidates?${query.toString()}`)
  }

  async function handleExcelFile(file: File) {
    const { rows: parsedRows, errors: parsedErrors } = await parseCSVFile(file)
    setImportPreview(parsedRows)
    setImportErrors((parsedErrors as any[]) || [])
    if (parsedRows.length > 0) {
      setEditingId(null)
      setForm({ ...parsedRows[0] })
      addToast('Form populated from CSV (first row)', 'info', 1500)
    }
  }

  function importParsedRows() {
    if (!importPreview.length) return
    ;(async () => {
      try {
        const inserted = await CandidateService.createMany(importPreview as any)
        setRows((prev) => [...inserted, ...prev])
        addToast(`Imported ${inserted.length} candidates`, 'success')
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
          const updated = await CandidateService.update(String(editingId), effectiveForm)
          if (!updated) {
            addToast('Update failed', 'error')
            return
          }
          setRows((prev) => prev.map((d) => (String(d.id) === String(editingId) ? { ...d, ...updated } : d)))
          addToast('Candidate updated', 'success')
        } else {
          const created = await CandidateService.create(effectiveForm as any)
          setRows((prev) => [created, ...prev])
          addToast('Candidate added', 'success')
        }
        closeDrawer()
      } catch (e: any) {
        addToast('Save failed: ' + (e?.message || String(e)), 'error')
      }
    })()
  }

  const chartCommonOptions = {
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
  }

  return (
    <div className="container">
      <div className="topbar" style={{ alignItems: 'center' }}>
        <div>
          <h1 id="pageTitle">Recruitment Dashboard</h1>
          <p id="pageSub">Interactive ATS analytics for recruiters and HR teams</p>
        </div>
      </div>

      {error && <div className="card" style={{ marginBottom: 12, color: 'var(--status-rejected)' }}>Failed to load dashboard data.</div>}

      <div className="card dashboard-filter-bar">
        <div className="dashboard-filter-grid">
          <input type="date" value={filters.dateFrom} onChange={(e) => handleFilterChange('dateFrom', e.target.value)} title="From" />
          <input type="date" value={filters.dateTo} onChange={(e) => handleFilterChange('dateTo', e.target.value)} title="To" />

          <select value={filters.job} onChange={(e) => handleFilterChange('job', e.target.value)}>
            <option value="">All Jobs</option>
            {filterOptions.jobsList.map((job) => <option key={job} value={job}>{job}</option>)}
          </select>

          <select value={filters.recruiter} onChange={(e) => handleFilterChange('recruiter', e.target.value)} disabled={!filterOptions.recruiters.length}>
            <option value="">{filterOptions.recruiters.length ? 'All Recruiters' : 'No Recruiter Data'}</option>
            {filterOptions.recruiters.map((rec) => <option key={rec} value={rec}>{rec}</option>)}
          </select>

          <div style={{ display: 'flex', alignItems: 'center' }}>
            <input
              list="skill-list"
              placeholder="Search skills..."
              value={filters.skill}
              onChange={(e) => handleFilterChange('skill', e.target.value)}
              style={{ minWidth: 160 }}
            />
            <datalist id="skill-list">
              <option value="">All Skills</option>
              {filterOptions.skills.map((skill) => <option key={skill} value={skill}>{skill}</option>)}
            </datalist>
          </div>

          <select value={filters.experience} onChange={(e) => handleFilterChange('experience', e.target.value)}>
            <option value="">All Experience</option>
            {EXPERIENCE_BUCKETS.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
          </select>

          <div style={{ display: 'flex', alignItems: 'center' }}>
            <input
              list="location-list"
              placeholder="Search locations..."
              value={filters.location}
              onChange={(e) => handleFilterChange('location', e.target.value)}
              style={{ minWidth: 160 }}
            />
            <datalist id="location-list">
              <option value="">All Locations</option>
              {filterOptions.locations.map((loc) => <option key={loc} value={loc}>{loc}</option>)}
            </datalist>
          </div>

          <select value={filters.status} onChange={(e) => handleFilterChange('status', e.target.value)}>
            <option value="">All Statuses</option>
            {Object.entries(STATUS_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>

          <select value={filters.stage} onChange={(e) => handleFilterChange('stage', e.target.value)}>
            <option value="">All Stages</option>
            {STAGE_ORDER.map((stage) => <option key={stage} value={stage}>{STAGE_LABEL[stage]}</option>)}
          </select>

          <button className="btn btn-ghost" onClick={clearFilters}>Clear Filters</button>
        </div>
      </div>

      <div className="kpi-grid" style={{ marginBottom: 18 }}>
        <button className="stat-card kpi" onClick={() => handleFilterChange('status', '')} title="View all candidates">
          <div className="kpi-left"><div className="num">{kpis.total.value}</div><div className="label">Total Candidates</div></div>
          <div className="kpi-right">{kpis.total.trend ? `↗ ${kpis.total.trend}` : '📥'}</div>
        </button>
        <button className="stat-card kpi selected" onClick={() => handleFilterChange('status', 'selected')} title="Filter selected candidates">
          <div className="kpi-left"><div className="num">{kpis.selected.value}</div><div className="label">Selected</div></div>
          <div className="kpi-right">✅</div>
        </button>
        <button className="stat-card kpi progress" onClick={() => handleFilterChange('status', 'progress')} title="Filter pipeline candidates">
          <div className="kpi-left"><div className="num">{kpis.pipeline.value}</div><div className="label">In Pipeline</div></div>
          <div className="kpi-right">🔄</div>
        </button>
        <button className="stat-card kpi rejected" onClick={() => handleFilterChange('status', 'rejected')} title="Filter closed out candidates">
          <div className="kpi-left"><div className="num">{kpis.closedOut.value}</div><div className="label">Closed Out</div></div>
          <div className="kpi-right">❌</div>
        </button>
      </div>

      {isLoading ? <div className="card">Loading dashboard...</div> : null}

      {!isLoading && (
        <div className="dashboard-grid-v2">
          <div className="chart-card">
            <div className="card-header">
              <div><strong>Recruitment Funnel</strong><div className="card-sub">Applications to selected conversion</div></div>
            </div>
            <div style={{ marginTop: 12, height: 240 }}>
              <Bar
                data={{
                  labels: analytics.conversion.map((x) => STAGE_LABEL[x.stage]),
                  datasets: [{ label: 'Candidates', data: analytics.conversion.map((x) => x.count), backgroundColor: 'rgba(30,58,138,0.82)' }]
                }}
                options={{
                  ...chartCommonOptions,
                  onClick: (_evt: any, els: any[], chart: any) => {
                    if (!els?.length) return
                    const index = els[0].index
                    const stage = analytics.conversion[index]?.stage
                    if (stage) handleFilterChange('stage', stage)
                  }
                }}
              />
            </div>
            <div className="dashboard-inline-list">
              {analytics.conversion.map((item) => (
                <button key={item.stage} className="dashboard-inline-pill" onClick={() => handleFilterChange('stage', item.stage)}>
                  {STAGE_LABEL[item.stage]}: {item.count} {item.rate == null ? '' : `(${item.rate}% conv.)`}
                </button>
              ))}
            </div>
          </div>

          <div className="chart-card">
            <div className="card-header">
              <div><strong>Status Distribution</strong><div className="card-sub">Click a segment to filter</div></div>
            </div>
            <div style={{ marginTop: 12, height: 240 }}>
              <Doughnut
                data={{
                  labels: Object.entries(STATUS_LABEL).map(([, label]) => label),
                  datasets: [{
                    data: Object.keys(STATUS_LABEL).map((key) => analytics.statusCounts[key as StatusKey]),
                    backgroundColor: Object.keys(STATUS_LABEL).map((key) => STATUS_COLORS[key as StatusKey])
                  }]
                }}
                options={{
                  maintainAspectRatio: false,
                  onClick: (_evt: any, els: any[]) => {
                    if (!els?.length) return
                    const status = Object.keys(STATUS_LABEL)[els[0].index]
                    handleFilterChange('status', String(status || ''))
                  }
                }}
              />
            </div>
          </div>

          <div className="chart-card full-width">
            <div className="card-header">
              <div><strong>Skills Analytics</strong><div className="card-sub">Most common skills from candidate records</div></div>
              <div style={{ display: 'flex', gap: 8 }}>
                {analytics.allSkillsCount > 10 && (
                  <button className="btn btn-ghost" onClick={() => setShowAllSkills((v) => !v)}>{showAllSkills ? 'Show Top 10' : 'View All Skills'}</button>
                )}
                {filters.skill ? (
                  <button className="btn btn-primary" onClick={() => navigateCandidates({ skill: filters.skill })}>View Candidates</button>
                ) : null}
              </div>
            </div>
            {analytics.topSkills.length ? (
              <div style={{ marginTop: 12, height: 280 }}>
                <Bar
                  data={{
                    labels: analytics.topSkills.map(([name]) => name),
                    datasets: [{ label: 'Candidates', data: analytics.topSkills.map(([, count]) => count), backgroundColor: 'rgba(37,99,235,0.85)' }]
                  }}
                  options={{
                    ...chartCommonOptions,
                    indexAxis: 'y' as const,
                    onClick: (_evt: any, els: any[]) => {
                      if (!els?.length) return
                      const skill = analytics.topSkills[els[0].index]?.[0]
                      if (skill) handleFilterChange('skill', skill)
                    }
                  }}
                />
              </div>
            ) : (
              <div className="dashboard-empty">No skills data available in current candidate records.</div>
            )}

            {filters.skill && selectedSkillBreakdown && (
              <div className="dashboard-inline-list">
                {Object.entries(selectedSkillBreakdown).map(([status, count]) => (
                  <span key={status} className="dashboard-inline-pill">{STATUS_LABEL[status as StatusKey]}: {count}</span>
                ))}
              </div>
            )}
          </div>

          <div className="chart-card">
            <div className="card-header">
              <div><strong>Experience Mix</strong><div className="card-sub">Click a range to filter</div></div>
            </div>
            <div style={{ marginTop: 12, height: 220 }}>
              <Bar
                data={{
                  labels: EXPERIENCE_BUCKETS.map((b) => b.label),
                  datasets: [{ label: 'Candidates', data: EXPERIENCE_BUCKETS.map((b) => analytics.expCounts[b.key] || 0), backgroundColor: 'rgba(30,58,138,0.8)' }]
                }}
                options={{
                  ...chartCommonOptions,
                  onClick: (_evt: any, els: any[]) => {
                    if (!els?.length) return
                    const bucket = EXPERIENCE_BUCKETS[els[0].index]?.key
                    if (bucket) handleFilterChange('experience', bucket)
                  }
                }}
              />
            </div>
          </div>

          <div className="chart-card">
            <div className="card-header">
              <div><strong>Candidate Sources</strong><div className="card-sub">Source and conversion quality</div></div>
            </div>
            {analytics.sourceDataAvailable ? (
              <div className="dashboard-source-list">
                {analytics.sources.map((row) => (
                  <button key={row.source} className="dashboard-source-item" onClick={() => navigateCandidates({ search: row.source })}>
                    <span>{row.source}</span>
                    <span>{row.count} ({row.percent}%) • Selected: {row.selected}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="dashboard-empty">Candidate source field is unavailable in current records.</div>
            )}
          </div>

          <div className="chart-card full-width">
            <div className="card-header">
              <div><strong>Location Coverage</strong><div className="card-sub">Top normalized locations (Unknown tracked separately)</div></div>
            </div>
            <div style={{ marginTop: 12, height: 240 }}>
              <Bar
                data={{
                  labels: analytics.topLocations.map(([loc]) => loc),
                  datasets: [{ label: 'Count', data: analytics.topLocations.map(([, c]) => c), backgroundColor: 'rgba(37,99,235,0.85)' }]
                }}
                options={{
                  ...chartCommonOptions,
                  onClick: (_evt: any, els: any[]) => {
                    if (!els?.length) return
                    const loc = analytics.topLocations[els[0].index]?.[0]
                    if (loc) handleFilterChange('location', loc)
                  }
                }}
              />
            </div>
          </div>

          <div className="chart-card">
            <div className="card-header">
              <div><strong>Interview Analytics</strong><div className="card-sub">Derived from interview fields and statuses</div></div>
            </div>
            <div className="dashboard-metric-grid">
              <div className="dashboard-metric-item"><span>Scheduled</span><strong>{analytics.interviewsScheduled}</strong></div>
              <div className="dashboard-metric-item"><span>Completed</span><strong>{analytics.interviewsCompleted}</strong></div>
              <div className="dashboard-metric-item"><span>Upcoming</span><strong>{analytics.upcomingCount}</strong></div>
              <div className="dashboard-metric-item"><span>Rescheduled</span><strong>{analytics.rescheduled}</strong></div>
              <div className="dashboard-metric-item"><span>No Shows</span><strong>{analytics.noShows}</strong></div>
            </div>
            <div style={{ marginTop: 10, height: 140 }}>
              <Line
                data={{
                  labels: analytics.monthlyTrend.map(([month]) => month),
                  datasets: [{ label: 'Candidates', data: analytics.monthlyTrend.map(([, count]) => count), borderColor: '#1E3A8A', backgroundColor: 'rgba(30,58,138,0.18)' }]
                }}
                options={{ maintainAspectRatio: false, plugins: { legend: { display: false } } }}
              />
            </div>
          </div>

          <div className="chart-card">
            <div className="card-header">
              <div><strong>Upcoming Interviews</strong><div className="card-sub">Nearest interview schedules</div></div>
            </div>
            {analytics.upcomingInterviews.length ? (
              <div className="dashboard-list">
                {analytics.upcomingInterviews.map((item) => (
                  <div key={item.id} className="dashboard-list-row">
                    <div>
                      <strong>{item.candidateName}</strong>
                      <div>{item.jobTitle} • {item.round}</div>
                      <div>{item.whenLabel} • {item.interviewer}</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                      <span className="chip">{item.status}</span>
                      <button className="btn btn-ghost" onClick={() => navigateCandidates({ search: item.candidateName })}>View Candidate</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="dashboard-empty">No upcoming interviews.</div>
            )}
          </div>

          <div className="chart-card">
            <div className="card-header">
              <div><strong>Jobs Overview</strong><div className="card-sub">Openings and job-wise pipeline</div></div>
            </div>
            <div className="dashboard-metric-grid jobs-overview-kpis">
              <div className="dashboard-metric-item"><span>Open Positions</span><strong>{analytics.jobsOverview.openPositions}</strong></div>
              <div className="dashboard-metric-item"><span>Applications</span><strong>{analytics.jobsOverview.applications}</strong></div>
              <div className="dashboard-metric-item"><span>Positions Filled</span><strong>{analytics.jobsOverview.positionsFilled}</strong></div>
              <div className="dashboard-metric-item"><span>On Hold</span><strong>{analytics.jobsOverview.positionsOnHold}</strong></div>
            </div>
            <div className="dashboard-table-wrap">
              <table className="dashboard-mini-table">
                <thead>
                  <tr><th>Job</th><th>Applicants</th><th>Interviews</th><th>Selected</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {analytics.jobRows.slice(0, 6).map((job) => (
                    <tr key={job.id} onClick={() => navigateCandidates({ job: job.title })}>
                      <td>{job.title}</td>
                      <td>{job.applicants}</td>
                      <td>{job.interviews}</td>
                      <td>{job.selected}</td>
                      <td>{job.status}</td>
                    </tr>
                  ))}
                  {!analytics.jobRows.length && <tr><td colSpan={5}>No jobs available.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          <div className="chart-card">
            <div className="card-header">
              <div><strong>Recent Candidate Activity</strong><div className="card-sub">Latest 10 recruitment events</div></div>
            </div>
            {analytics.activities.length ? (
              <div className="dashboard-list">
                {analytics.activities.slice(0, 8).map((activity) => (
                  <div key={activity.id} className="dashboard-list-row">
                    <div>
                      <strong>{activity.label}</strong>
                      <div>{activity.detail}</div>
                    </div>
                    <span>{formatDateTime(activity.timestamp)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="dashboard-empty">No recent activity found.</div>
            )}
          </div>

          <div className="chart-card full-width">
            <div className="card-header">
              <div><strong>Time-to-Hire Metrics</strong><div className="card-sub">Shown only when enough timestamp data exists</div></div>
            </div>
            <div className="dashboard-metric-grid">
              {analytics.avgTimeToHire != null ? <div className="dashboard-metric-item"><span>Average Time to Hire</span><strong>{analytics.avgTimeToHire} days</strong></div> : null}
              {analytics.avgTimeToScreen != null ? <div className="dashboard-metric-item"><span>Average Time to Screen</span><strong>{analytics.avgTimeToScreen} days</strong></div> : null}
              {analytics.avgTimeToInterview != null ? <div className="dashboard-metric-item"><span>Average Time to Interview</span><strong>{analytics.avgTimeToInterview} days</strong></div> : null}
              {analytics.avgTimeToHire == null && analytics.avgTimeToScreen == null && analytics.avgTimeToInterview == null ? (
                <div className="dashboard-empty">Insufficient timestamp data for time-to-hire metrics.</div>
              ) : null}
            </div>
          </div>
        </div>
      )}

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
