import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { z } from 'zod'
import { Candidate } from '../types'

type ParseResult = { rows: Candidate[]; errors: string[] }

const candidateSchema = z.object({
  name: z.string().min(1),
  email: z.preprocess((v) => blankToUndefined(v), z.string().email().optional()),
  phone: z.preprocess((v) => {
    if (v == null) return undefined
    const s = String(v).replace(/[^0-9]/g, '')
    return s === '' ? undefined : s
  }, z.string().regex(/^[0-9]{7,15}$/).optional()),
  experience: z.preprocess((v) => parseNumber(v), z.number().optional()),
  current_company: z.string().optional(),
  current_location: z.string().optional(),
  preferred_location: z.string().optional(),
  skills: z.string().optional(),
  notice_period: z.string().optional(),
  current_ctc: z.preprocess((v) => parseNumber(v), z.number().optional()),
  expected_ctc: z.preprocess((v) => parseNumber(v), z.number().optional())
})

function normalizeKey(k: string) {
  return k
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/^_+|_+$/g, '')
}

function blankToUndefined(v: unknown) {
  if (v == null) return undefined
  const s = String(v).trim()
  return s === '' ? undefined : s
}

function parseNumber(v: unknown) {
  const s = blankToUndefined(v)
  if (s == null) return undefined
  if (typeof s === 'number') return Number.isFinite(s) ? s : undefined
  const match = String(s).replace(/,/g, '').match(/-?\d+(\.\d+)?/)
  return match ? Number(match[0]) : undefined
}

function parseDateString(v: unknown) {
  const s = blankToUndefined(v)
  if (!s) return undefined
  // handle Date objects
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const y = v.getFullYear()
    const mm = String(v.getMonth() + 1).padStart(2, '0')
    const dd = String(v.getDate()).padStart(2, '0')
    return `${y}-${mm}-${dd}`
  }
  if (typeof s !== 'string') return undefined
  const trimmed = s.trim()
  // Excel may render ####### for overflow/masked dates — treat as empty
  if (/^#+$/.test(trimmed)) return undefined
  // already ISO yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
  // Try numeric date formats: dd-mm-yyyy, mm/dd/yyyy
  let m = trimmed.match(/^(\d{1,2})[\/ -](\d{1,2})[\/ -](\d{2,4})$/)
  if (m) {
    const d = Number(m[1])
    const mo = Number(m[2])
    let y = Number(m[3])
    if (m[3].length === 2) {
      y = y + (y >= 70 ? 1900 : 2000)
    }
    if (y >= 1900 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      const mm = String(mo).padStart(2, '0')
      const dd = String(d).padStart(2, '0')
      return `${y}-${mm}-${dd}`
    }
  }

  // Try patterns with month names: 04-Aug-2026 or 4 Aug 26
  const monthNames: Record<string, number> = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, sept:9, oct:10, nov:11, dec:12 }
  m = trimmed.match(/^(\d{1,2})[\s\/-]([A-Za-z]{3,9})[\s\/-](\d{2,4})$/)
  if (m) {
    const d = Number(m[1])
    const monRaw = (m[2] || '').toLowerCase().substr(0,3)
    let y = Number(m[3])
    if (m[3].length === 2) y = y + (y >= 70 ? 1900 : 2000)
    const mo = monthNames[monRaw] || 0
    if (y >= 1900 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      const mm = String(mo).padStart(2, '0')
      const dd = String(d).padStart(2, '0')
      return `${y}-${mm}-${dd}`
    }
  }
  // Do not use Date.parse fallback — avoid implicit timezone conversions.
  // If explicit patterns above do not match, return undefined so the raw value is preserved.
  return undefined
}

function normalizeSelectionStatus(v: unknown) {
  const s = String(v ?? '').trim().toLowerCase()
  if (!s) return 'progress'
  if (s.includes('reject')) return 'rejected'
  if (s.includes('select') || s.includes('offer')) return 'selected'
  if (s.includes('hold')) return 'hold'
  if (s.includes('drop')) return 'dropped'
  if (s.includes('progress') || s.includes('process') || s.includes('pending') || s.includes('round') || s.includes('interview')) return 'progress'
  return 'progress'
}

function firstValue(raw: Record<string, any>, keys: string[]) {
  for (const key of keys) {
    const value = raw[key]
    if (blankToUndefined(value) !== undefined) return value
  }
  return undefined
}

function normalizeRow(raw: Record<string, any>) {
  const normalized: Record<string, any> = {}

  for (const k in raw) {
    const key = normalizeKey(k)
    if (!key) continue
    if (blankToUndefined(normalized[key]) === undefined) normalized[key] = raw[k]
  }

  normalized.name = firstValue(normalized, ['name', 'candidate_name', 'candidate', 'full_name', 'fullname']) || ''

  if (!normalized.name) {
    const fn = firstValue(normalized, ['first_name', 'firstname', 'given_name'])
    const ln = firstValue(normalized, ['last_name', 'lastname', 'surname'])
    if (fn || ln) normalized.name = [fn, ln].filter(Boolean).join(' ').trim()
  }

  normalized.email = firstValue(normalized, ['email', 'email_id', 'email_address', 'mail'])
  normalized.phone = firstValue(normalized, ['phone', 'phone_number', 'mobile', 'contact', 'cell', 'cell_number'])
  normalized.experience = firstValue(normalized, ['experience', 'relevant_experience', 'exp', 'years', 'yoe'])
  normalized.current_company = firstValue(normalized, ['current_company', 'company', 'employer', 'organisation', 'organization'])
  normalized.current_location = firstValue(normalized, ['current_location', 'location', 'city', 'town', 'place'])
  normalized.preferred_location = firstValue(normalized, ['preferred_location'])
  normalized.skills = firstValue(normalized, ['skills', 'skill'])
  normalized.notice_period = firstValue(normalized, ['notice_period', 'np', 'notice', 'noticeperiod'])
  normalized.current_ctc = firstValue(normalized, ['current_ctc', 'cctc', 'c_ctc', 'ctc', 'current_salary', 'currentctc'])
  normalized.expected_ctc = firstValue(normalized, ['expected_ctc', 'ectc', 'e_ctc', 'expected_salary', 'expectedctc'])

  normalized.role = firstValue(normalized, ['role', 'job_role', 'position'])
  // job identifiers from CSV (friendly job_id, applied_job_id, job_ref)
  normalized.applied_job_id = firstValue(normalized, ['applied_job_id', 'job_id', 'job_ref'])
  normalized.date = firstValue(normalized, ['date', 'date_of_submission', 'submission_date'])
  // normalize date strings to ISO yyyy-mm-dd to avoid DB errors
  try {
    const parsedDate = parseDateString(normalized.date)
    if (parsedDate) normalized.date = parsedDate
  } catch (e) {
    // ignore and keep original value
  }
  normalized.linkedin = firstValue(normalized, ['linkedin', 'linkedin_profile', 'linkedin_url'])
  normalized.availability = firstValue(normalized, ['availability', 'interview_availability'])
  // new fields: interview slot provided by client, and whether candidate confirmed availability
  normalized.interview_slot = firstValue(normalized, ['interview_slot', 'interview_slot_given_by_client', 'slot', 'interview_slot_client'])
  normalized.confirmed_availability = firstValue(normalized, ['confirmed_availability', 'candidates_confirmed_availability', 'candidates_confirmed', 'confirmed_avail'])
  normalized.intstatus = firstValue(normalized, ['intstatus', 'interview_status'])
  normalized.selstatus = normalizeSelectionStatus(firstValue(normalized, ['selstatus', 'selection_status', 'status', 'candidate_status']))
  normalized.remarks = firstValue(normalized, ['remarks', 'notes'])
  normalized.f2f = firstValue(normalized, ['f2f', 'f2f_interview_availability'])

  // Normalize interview-related date+time fields into structured objects when possible.
  // Returns either a structured object { display, date, day, start_time, end_time, time, timezone }
  // or the original trimmed string when parsing fails.
  const normalizeDateTimeField = (val: any) => {
    if (val == null) return val
    let s = String(val).trim()
    if (!s) return s
    s = s.replace(/^"|"$/g, '').replace(/^\(|\)$/g, '').trim()
    s = s.replace(/[–—]/g, '-').replace(/\s*-\s*/g, ' - ').replace(/\s+/g, ' ').trim()

    // Try to extract ISO-style date (yyyy-mm-dd) anywhere in the string
    const isoDateMatch = s.match(/(\d{4}-\d{2}-\d{2})/)
    let dateIso: string | null = isoDateMatch ? isoDateMatch[1] : null

    // If no ISO date, try to parse common date patterns using parseDateString
    if (!dateIso) {
      const parsed = parseDateString(s)
      if (parsed && /^\d{4}-\d{2}-\d{2}$/.test(parsed)) dateIso = parsed
    }

    // Helper to format display date and weekday
    const formatDisplayDate = (dIso: string) => {
      try {
        const d = new Date(dIso + 'T00:00:00')
        const weekday = d.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'Asia/Kolkata' })
        const day = String(d.getDate()).padStart(2, '0')
        const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
        const mon = monthNames[d.getMonth()]
        const year = d.getFullYear()
        return { displayDate: `${day}-${mon}-${year}`, weekday }
      } catch (e) {
        return { displayDate: dIso, weekday: '' }
      }
    }

    // Extract time tokens like 11:30AM or 11:30 AM
    const timeRegex = /(\d{1,2}:\d{2})\s*(AM|PM|am|pm)?/g
    const times: string[] = []
    let tm: RegExpExecArray | null
    while ((tm = timeRegex.exec(s)) !== null) {
      const hhmm = tm[1]
      const ap = tm[2] ? tm[2].toUpperCase() : ''
      const formatted = ap ? `${hhmm} ${ap}` : hhmm
      times.push(formatted)
    }

    // If we have a date, build structured object
    if (dateIso) {
      const { displayDate, weekday } = formatDisplayDate(dateIso)
      // For ranges, look for two times
      if (times.length >= 2) {
        const start = times[0]
        const end = times[1]
        const display = `${weekday}, ${displayDate} - ${start} to ${end}`
        return { display, date: dateIso, day: weekday, start_time: start, end_time: end }
      }
      // Single time
      if (times.length === 1) {
        const t = times[0]
        const display = `${weekday}, ${displayDate} - ${t}`
        return { display, date: dateIso, day: weekday, time: t }
      }
      // No explicit time found — return date-only structured
      const display = `${weekday}, ${displayDate}`
      return { display, date: dateIso, day: weekday }
    }

    // If no date found but times found, return times-only structure
    if (times.length === 2) return { display: s, start_time: times[0], end_time: times[1] }
    if (times.length === 1) return { display: s, time: times[0] }

    // Fallback: return original trimmed string
    return s
  }

  if (normalized.interview_slot) normalized.interview_slot = normalizeDateTimeField(normalized.interview_slot)
  if (normalized.availability) normalized.availability = normalizeDateTimeField(normalized.availability)
  if (normalized.f2f) normalized.f2f = normalizeDateTimeField(normalized.f2f)

  return normalized
}

function getMissingOrInvalidFields(normalized: Record<string, any>) {
  const issues: string[] = []
  const name = blankToUndefined(normalized.name)
  if (!name) issues.push('Candidate name is missing')

  const emailRaw = blankToUndefined(normalized.email)
  if (!emailRaw) {
    issues.push('Email is missing')
  } else {
    const emailCheck = z.string().email()
    const ok = emailCheck.safeParse(emailRaw)
    if (!ok.success) issues.push('Email is invalid')
  }

  return issues
}

function buildCandidate(normalized: Record<string, any>, fileName: string, sheetName: string): Candidate & Record<string, any> {
  try {
    const parsed = candidateSchema.parse(normalized)
    return {
      name: parsed.name,
      email: parsed.email || '',
      phone: parsed.phone || '',
      experience: parsed.experience,
      current_company: parsed.current_company,
      current_location: parsed.current_location,
      preferred_location: parsed.preferred_location,
      skills: parsed.skills,
      notice_period: parsed.notice_period,
      current_ctc: parsed.current_ctc,
      expected_ctc: parsed.expected_ctc,
        interview_slot: parsed.interview_slot || normalized.interview_slot || '',
        confirmed_availability: parsed.confirmed_availability || normalized.confirmed_availability || '',
      sheet_name: sheetName || fileName,
      job_role: normalized.role || sheetName || fileName,
      role: normalized.role || sheetName || fileName,
      date: normalized.date || '',
      exp: normalized.experience || '',
      cctc: normalized.current_ctc || '',
      ectc: normalized.expected_ctc || '',
      linkedin: normalized.linkedin || '',
      location: normalized.current_location || '',
      np: normalized.notice_period || '',
      availability: normalized.availability || '',
      intstatus: normalized.intstatus || '',
      selstatus: normalized.selstatus || 'progress',
      remarks: normalized.remarks || '',
      f2f: normalized.f2f || '',
      applied_job_id: normalized.applied_job_id || normalized.job_id || normalized.job_ref || '',
      applied_job_title: normalized.applied_job_title || normalized.job_title || normalized.job_role || normalized.role || ''
    }
  } catch {
    return {
      name: normalized.name || '',
      email: normalized.email || '',
      phone: (normalized.phone || '').toString(),
      experience: parseNumber(normalized.experience),
      current_company: normalized.current_company || '',
      current_location: normalized.current_location || '',
      preferred_location: normalized.preferred_location || '',
      skills: normalized.skills || '',
      notice_period: normalized.notice_period || normalized.np || '',
      current_ctc: parseNumber(normalized.current_ctc),
      expected_ctc: parseNumber(normalized.expected_ctc),
        interview_slot: normalized.interview_slot || '',
        confirmed_availability: normalized.confirmed_availability || '',
      sheet_name: sheetName || fileName,
      job_role: normalized.role || sheetName || fileName,
      role: normalized.role || sheetName || fileName,
      date: normalized.date || '',
      exp: normalized.experience || '',
      cctc: normalized.current_ctc || '',
      ectc: normalized.expected_ctc || '',
      linkedin: normalized.linkedin || '',
      location: normalized.current_location || '',
      np: normalized.notice_period || '',
      availability: normalized.availability || '',
      intstatus: normalized.intstatus || '',
      selstatus: normalized.selstatus || 'progress',
      remarks: normalized.remarks || '',
      f2f: normalized.f2f || '',
      applied_job_id: normalized.applied_job_id || normalized.job_id || normalized.job_ref || '',
      applied_job_title: normalized.applied_job_title || normalized.job_title || normalized.job_role || normalized.role || ''
    }
  }
}

function rowsFromSheet(sheet: XLSX.WorkSheet) {
  const matrix = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '', raw: false })
  const headerIndex = matrix.findIndex(row => row.some(cell => blankToUndefined(cell) !== undefined))
  if (headerIndex < 0) return []

  const headers = matrix[headerIndex].map((cell, index) => normalizeKey(String(cell || '')) || `unused_column_${index}`)

  return matrix.slice(headerIndex + 1).flatMap((row) => {
    if (!row.some(cell => blankToUndefined(cell) !== undefined)) return []
    const raw: Record<string, any> = {}
    headers.forEach((header, index) => {
      if (!header.startsWith('unused_column_')) raw[header] = row[index]
    })
    return [raw]
  })
}

async function parseExcelFile(file: File): Promise<ParseResult> {
  try {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
    const rows: Candidate[] = []
    const errors: string[] = []

    workbook.SheetNames.forEach((sheetName) => {
      const sheetRows = rowsFromSheet(workbook.Sheets[sheetName])
      sheetRows.forEach((raw, index) => {
        const normalized = normalizeRow(raw)
        // Always build candidate: convert with best-effort values and preserve raw fields.
        const candidate = buildCandidate(normalized, file.name, sheetName)
        // Attach any validation hints but do not block upload
        const issues = getMissingOrInvalidFields(normalized)
        if (issues.length > 0) candidate._validation_issues = issues.join('; ')
        rows.push(candidate)
      })
    })

    return { rows, errors }
  } catch (error: any) {
    return { rows: [], errors: [`Excel parsing error: ${error?.message || String(error)}`] }
  }
}

function parsePapaCSVFile(file: File): Promise<ParseResult> {
  return new Promise(resolve => {
    const errors: string[] = []
    Papa.parse<Record<string, any>>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h, index) => normalizeKey(String(h || '')) || `unused_column_${index}`,
      complete: (results) => {
        const rawRows = results.data || []
        const rows: Candidate[] = []

        for (let i = 0; i < rawRows.length; i++) {
          const normalized = normalizeRow(rawRows[i])
          const candidate = buildCandidate(normalized, file.name, file.name)
          const issues = getMissingOrInvalidFields(normalized)
          if (issues.length > 0) candidate._validation_issues = issues.join('; ')
          rows.push(candidate)
        }

        resolve({ rows, errors })
      },
      error: (error) => {
        resolve({ rows: [], errors: [`CSV parsing error: ${error.message}`] })
      }
    })
  })
}

export const parseCSVFile = (file: File): Promise<ParseResult> => {
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (extension === 'xlsx' || extension === 'xls') return parseExcelFile(file)
  return parsePapaCSVFile(file)
}
