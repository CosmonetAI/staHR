import React from 'react'
import { FaEnvelope, FaPhoneAlt, FaLinkedin, FaStickyNote, FaMapMarkerAlt, FaCalendarAlt, FaClock, FaBriefcase, FaMoneyBillWave, FaUserCheck, FaPen } from 'react-icons/fa'
import { supabase } from '../../../supabase/supabaseClient'

type Props = {
  candidate: Record<string, any>
  jobsMap?: Record<string, any>
}

function display(value: any) {
  return String(value ?? '').trim() || '-'
}

function formatLocation(value: any) {
  const text = String(value ?? '').trim()
  if (!text) return '-'
  return text
    .split(/\s+/)
    .map(part => part ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : part)
    .join(' ')
}

function formatExperience(value: any) {
  const text = String(value ?? '').trim()
  if (!text) return '-'
  return /years?/i.test(text) ? text.replace(/years?/i, 'years') : `${text} years`
}

function formatNoticePeriod(value: any) {
  const text = String(value ?? '').trim()
  if (!text) return '-'
  return /^\d+(\.\d+)?$/.test(text) ? `${text} days` : text
}

function formatCtc(value: any) {
  const text = String(value ?? '').trim()
  if (!text) return '-'
  const withoutUnit = text.replace(/lpa/ig, '').trim()
  const numeric = Number(withoutUnit.replace(/,/g, ''))
  const displayValue = Number.isFinite(numeric) ? String(Number(numeric.toFixed(2))) : withoutUnit
  return `${displayValue} LPA`
}

function hikeLabel(current: any, expected: any) {
  const currentValue = Number(String(current ?? '').replace(/[^0-9.]/g, ''))
  const expectedValue = Number(String(expected ?? '').replace(/[^0-9.]/g, ''))
  if (!Number.isFinite(currentValue) || !Number.isFinite(expectedValue) || currentValue <= 0) return ''
  const pct = Math.round(((expectedValue - currentValue) / currentValue) * 100)
  return `${pct >= 0 ? '+' : ''}${pct}%`
}

export default function CandidateProfileView({ candidate, jobsMap = {} }: Props) {
  if (!candidate) return null
  const c = candidate

  const jobIdKey = String(c.applied_job_id || c.job_id || c.job_ref || '')
  const job = jobsMap && jobIdKey ? jobsMap[jobIdKey] : null

  return (
    <div className="candidate-profile-panel" style={{ padding: 12 }}>
      <div className="candidate-profile-head">
        <div className="candidate-profile-identity">
          <div className="candidate-avatar">{display(c.name).slice(0, 1).toUpperCase()}</div>
          <div>
            <div className="candidate-profile-name">{display(c.name)}</div>
            <div className="candidate-profile-sub">{display(c.email)}</div>
            <div style={{ marginTop: 6, display: 'flex', gap: 16, alignItems: 'center' }}>
              <div style={{ fontSize: 13 }}><strong>Job Role:</strong> <span style={{ marginLeft: 6 }}>{display(c.applied_job_title || c.role || '-')}</span></div>
              <div style={{ fontSize: 13 }}><strong>Job ID:</strong> <span style={{ marginLeft: 6 }}>{(job && job.job_id) || display(c.applied_job_id || c.job_id || '-')}</span></div>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
          <div className={`badge`} style={{ textTransform: 'none' }}>{display(c.selstatus || c._status_full || c._status)}</div>
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>{display(c._recruiter || c.recruiter || '')}</div>
        </div>
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
          <FaStickyNote />
          <div>
            <label>Resume</label>
            <div>
              {c.resume_url ? (
                <a href={c.resume_url} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)' }}>View / Download</a>
              ) : c.resume_path ? (
                <span style={{ fontSize: 13 }}>{c.resume_path}</span>
              ) : (
                <span style={{ color: 'var(--muted)' }}>No resume</span>
              )}
            </div>
          </div>
        </div>
        <div className="profile-field">
          <FaMapMarkerAlt />
          <div>
            <label>Location</label>
            <div>{formatLocation(c.location || c.current_location || c._location)}</div>
          </div>
        </div>
        <div className="profile-field">
          <FaCalendarAlt />
          <div>
            <label>Applied</label>
            <div>{display(c.date || c.created_at || c._submittedDate)}</div>
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
            <div>{formatExperience(c.exp || c.experience || c._years)}</div>
          </div>
        </div>
        <div className="profile-field">
          <FaMoneyBillWave />
          <div>
            <label>Compensation</label>
            <div className="compensation-value">
              <span>{formatCtc(c.cctc || c.current_ctc)} → {formatCtc(c.ectc || c.expected_ctc)}</span>
              {hikeLabel(c.cctc || c.current_ctc, c.ectc || c.expected_ctc) && <span className="hike-badge">Hike: {hikeLabel(c.cctc || c.current_ctc, c.ectc || c.expected_ctc)}</span>}
            </div>
          </div>
        </div>
      </div>

      <div className="candidate-notes-grid" style={{ marginTop: 12 }}>
        <div className="candidate-note-card">
          <div className="note-card-head"><FaUserCheck /><label>Interview notes</label></div>
          <p>{display(c.intstatus)}</p>
        </div>
        <div className="candidate-note-card">
          <div className="note-card-head"><FaStickyNote /><label>Remarks</label></div>
          <div style={{ whiteSpace: 'pre-wrap' }}>{c.remarks || '-'}</div>
          <div style={{ height: 12 }} />
          <div className="note-card-head"><FaPen /><label>Client feedback</label></div>
          <div style={{ whiteSpace: 'pre-wrap' }}>{c.client_feedback || '-'}</div>
        </div>
      </div>
    </div>
  )
}
