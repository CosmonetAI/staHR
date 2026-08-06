import React from 'react'
import ReactDatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import { format as formatDateFn } from 'date-fns'

type Props = {
  label?: string
  // value may be an ISO string, a date-only string, null, or a structured object (from CSV import)
  value?: string | null | any
  onChange: (iso: string | null) => void
  required?: boolean
  disablePast?: boolean
  minDate?: string | null
  maxDate?: string | null
  error?: boolean
  helperText?: string
  dateOnly?: boolean
  enforceIST?: boolean
}

function parseIsoToLocalDate(iso?: string | null) {
  if (!iso) return null
  // If iso is an object with a date/time, extract
  if (typeof iso === 'object') {
    const obj: any = iso
    const datePart = obj.date || (typeof obj === 'object' && obj.display && String(obj.display).match(/(\d{2}-[A-Za-z]{3}-\d{4})/))
    const timePart = obj.start_time || obj.time || null
    if (datePart) {
      const dStr = String(datePart)
      // Try YYYY-MM-DD first
      const yyyyMatch = dStr.match(/^(\d{4}-\d{2}-\d{2})$/)
      if (yyyyMatch) {
        const y = Number(yyyyMatch[1].slice(0,4))
        const mon = Number(yyyyMatch[1].slice(5,7)) - 1
        const day = Number(yyyyMatch[1].slice(8,10))
        let hh = 0; let mm = 0
        if (timePart) {
          const tt = parseTimeString(String(timePart))
          if (tt) { hh = tt.h; mm = tt.m }
        }
        return new Date(y, mon, day, hh, mm, 0)
      }
      // try to parse dd-Mon-YYYY like 04-Aug-2026
      const dMatch2 = dStr.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/)
      if (dMatch2) {
        const day = Number(dMatch2[1])
        const monthNames: Record<string, number> = { Jan:0, Feb:1, Mar:2, Apr:3, May:4, Jun:5, Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11 }
        const mon = monthNames[dMatch2[2]] ?? 0
        const y = Number(dMatch2[3])
        let hh = 0; let mm = 0
        if (timePart) {
          const tt = parseTimeString(String(timePart))
          if (tt) { hh = tt.h; mm = tt.m }
        }
        return new Date(y, mon, day, hh, mm, 0)
      }
    }
    return null
  }
  // Accept formats like YYYY-MM-DD or YYYY-MM-DDTHH:mm[:ss]
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2}):?(\d{2})?)?$/)
  if (!m) return null
  const y = Number(m[1])
  const mon = Number(m[2]) - 1
  const d = Number(m[3])
  const hh = m[4] ? Number(m[4]) : 0
  const mm = m[5] ? Number(m[5]) : 0
  return new Date(y, mon, d, hh, mm, 0)
}

function parseTimeString(s: string) {
  const m = String(s).trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?$/)
  if (!m) return null
  let h = Number(m[1])
  const min = Number(m[2])
  const ap = m[3] ? m[3].toUpperCase() : null
  if (ap) {
    if (ap === 'PM' && h < 12) h += 12
    if (ap === 'AM' && h === 12) h = 0
  }
  return { h, m: min }
}

export default function DateTimeField({ label, value, onChange, required, disablePast, minDate, maxDate, error, helperText, dateOnly = false, enforceIST = false }: Props) {
  const [date, setDate] = React.useState<Date | null>(() => parseIsoToLocalDate(value || null))

  React.useEffect(() => {
    setDate(parseIsoToLocalDate(value || null))
  }, [value])

  const handleChange = (d: Date | null) => {
    setDate(d)
    if (!d) return onChange(null)

    const pad = (n: number) => String(n).padStart(2, '0')

    if (dateOnly) {
      // Return date in YYYY-MM-DD normalized to IST
      try {
        const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d)
        const y = parts.find(p => p.type === 'year')?.value
        const mm = parts.find(p => p.type === 'month')?.value
        const dd = parts.find(p => p.type === 'day')?.value
        if (y && mm && dd) {
          onChange(`${y}-${mm}-${dd}`)
          return
        }
      } catch (e) {
        // fallback to local date
        const y = d.getFullYear()
        const mm = pad(d.getMonth() + 1)
        const dd = pad(d.getDate())
        onChange(`${y}-${mm}-${dd}`)
        return
      }
    }

    if (enforceIST) {
      try {
        const parts = new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
        }).formatToParts(d)
        const y = parts.find(p => p.type === 'year')?.value
        const mm = parts.find(p => p.type === 'month')?.value
        const dd = parts.find(p => p.type === 'day')?.value
        const hh = parts.find(p => p.type === 'hour')?.value
        const min = parts.find(p => p.type === 'minute')?.value
        if (y && mm && dd && hh && min) {
          onChange(`${y}-${mm}-${dd}T${hh}:${min}:00`)
          return
        }
      } catch (e) {
        // fall through to local
      }
    }

    // Default: return local ISO-like without timezone
    const y = d.getFullYear()
    const m = pad(d.getMonth() + 1)
    const dd = pad(d.getDate())
    const hh = pad(d.getHours())
    const mm = pad(d.getMinutes())
    const iso = `${y}-${m}-${dd}T${hh}:${mm}:00`
    onChange(iso)
  }


  const today = new Date()
  // minDate/maxDate props may be ISO strings — parse similarly
  const min = minDate ? parseIsoToLocalDate(minDate) : (disablePast ? today : undefined)
  const max = maxDate ? parseIsoToLocalDate(maxDate) : undefined

  const parsedDisplay = date ? (dateOnly ? formatDateFn(date, 'dd MMM yyyy') : formatDateFn(date, "EEEE, dd MMM yyyy - hh:mm a")) : ''
  // If we couldn't parse a date, but the incoming value contains a human-friendly string,
  // prefer showing that so imported textual slots/availability are visible to the user.
  const rawDisplay = (() => {
    if (date) return ''
    if (value == null) return ''
    if (typeof value === 'string') return value.trim()
    if (typeof value === 'object') {
      const v: any = value
      if (v.display && typeof v.display === 'string') return String(v.display).trim()
      // fallback to joining object values for display
      return Object.values(v).filter(Boolean).join(' ').trim()
    }
    return String(value).trim()
  })()
  const display = parsedDisplay || rawDisplay

  // Custom input so we can show `display` text inside the picker input even when
  // there is no parsable `selected` date. ReactDatePicker will call `onClick`
  // to open the calendar when this input is clicked.
  const CustomInput = React.forwardRef((props: any, ref: any) => {
    const { onClick, placeholder } = props
    return (
      <input
        ref={ref}
        className={`${props.className || ''} date-input`}
        value={display}
        placeholder={placeholder}
        onClick={onClick}
        readOnly
        style={{ width: '100%' }}
      />
    )
  })

  return (
    <div className="field">
      {label ? <label>{label}{required ? ' *' : ''}</label> : null}
      <div>
        <ReactDatePicker
          selected={date}
          onChange={handleChange}
          showTimeSelect={!dateOnly}
          timeIntervals={30}
          dateFormat={dateOnly ? 'yyyy-MM-dd' : 'EEE, dd MMM yyyy - hh:mm aa'}
          placeholderText={dateOnly ? 'Select date' : 'Select date & time'}
          minDate={min as any}
          maxDate={max as any}
          isClearable
          ariaLabelledBy={label}
          customInput={<CustomInput />}
        />
      </div>
      {/* display is now rendered inside the input via CustomInput */}
      {helperText ? <div style={{ marginTop: 6, fontSize: 12, color: error ? 'var(--status-rejected)' : 'var(--muted)' }}>{helperText}</div> : null}
    </div>
  )
}
