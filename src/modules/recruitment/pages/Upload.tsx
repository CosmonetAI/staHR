import React, { useState } from 'react'
import FileUpload from '../../../components/FileUpload'
import { parseCSVFile } from '../../../utils/csvUtils'
import { UploadService } from '../services/uploadService'
import { CandidateService } from '../services/candidateService'
import { useToast } from '../../../components/ToastProvider'

const valueOrDash = (value: any) => {
  const text = String(value ?? '').trim()
  return text || '-'
}

const countUnique = (rows: any[], key: string) => {
  const values = new Set(rows.map(row => String(row[key] || '').trim()).filter(Boolean))
  return values.size
}

const statusClass = (status: string) => {
  const s = String(status || 'progress').toLowerCase()
  if (s.includes('select')) return 'selected'
  if (s.includes('reject')) return 'rejected'
  if (s.includes('hold')) return 'hold'
  if (s.includes('drop')) return 'dropped'
  return 'progress'
}

export default function Upload() {
  const [preview, setPreview] = useState<any[]>([])
  const [isImporting, setIsImporting] = useState(false)
  const addToast = useToast()

  const rowsFlat = preview.flatMap(p => p.rows || [])
  const totalRows = rowsFlat.length
  const totalErrors = preview.reduce((sum, p) => sum + (p.errors?.length || 0), 0)

  const handleFile = async (file: File) => {
    const { rows, errors } = await parseCSVFile(file)
    // coerce structured fields that may be objects or JSON strings
    const coerce = (v: any) => {
      if (v == null || v === '') return ''
      if (typeof v === 'object') return v
      if (typeof v === 'string') {
        const s = v.trim()
        if (!s) return ''
        try { const j = JSON.parse(s); if (j && typeof j === 'object') return j } catch (e) {}
        return s
      }
      return String(v)
    }
    const coerced = (rows || []).map(r => ({ ...r, interview_slot: coerce(r.interview_slot), confirmed_availability: coerce(r.confirmed_availability), availability: coerce(r.availability), f2f: coerce(r.f2f) }))
    setPreview([{ sheet: file.name, rows: coerced, errors }])
    const total = (rows || []).length
    if (!total) {
      // No rows parsed; do not display toasts here. Keep preview so user can inspect file.
      return
    }
    try { console.debug('Upload.handleFile: parsed', { file: file.name, total }) } catch (e) {}
  }

  const importParsed = async () => {
    if (!preview || !preview.length) {
      addToast('No candidates to import', 'error')
      return
    }
    try { console.debug('Upload.importParsed: prepared rowsFlat', { sheets: preview.map(r => r.sheet), total: rowsFlat.length, edgeUrl: import.meta.env.VITE_EDGE_IMPORT_URL }) } catch (e) {}
    try {
      setIsImporting(true)
      try { await UploadService.createUpload({ file_name: `import_${new Date().toISOString()}`, total_records: rowsFlat.length }) } catch (e) { console.debug('createUpload skipped', e) }
      const inserted = await CandidateService.createMany(rowsFlat)
      setIsImporting(false)
      const insertedCount = Array.isArray(inserted) ? inserted.length : (inserted?.inserted?.length || 0)
      addToast(`Imported ${insertedCount} candidates`, 'success')
    } catch (err) {
      setIsImporting(false)
      console.error('Import failed', err)
      addToast('Import failed. See console for details', 'error')
    }
  }

  return (
    <div className="container">
      <h2>Upload Excel</h2>
      <div className="card">
        <FileUpload onFile={handleFile} />
      </div>

      {preview.length > 0 && (
        <section className="upload-preview">
          <div className="upload-preview-head">
            <div>
              <h3>Candidate import review</h3>
              <p>{preview.map(p => p.sheet).join(', ')}</p>
            </div>
            <button className="btn btn-primary" onClick={importParsed} disabled={isImporting || totalRows === 0}>
              {isImporting ? 'Importing...' : `Import ${totalRows} candidate${totalRows === 1 ? '' : 's'}`}
            </button>
          </div>

          <div className="import-kpi-grid">
            <div className="import-kpi-card">
              <div className="import-kpi-value">{totalRows}</div>
              <div className="import-kpi-label">Candidates parsed</div>
            </div>
            <div className="import-kpi-card">
              <div className="import-kpi-value">{countUnique(rowsFlat, 'role')}</div>
              <div className="import-kpi-label">Roles found</div>
            </div>
            <div className="import-kpi-card">
              <div className="import-kpi-value">{countUnique(rowsFlat, 'location')}</div>
              <div className="import-kpi-label">Locations</div>
            </div>
            
          </div>

          {totalErrors > 0 && (
            <div className="import-warning">
              {totalErrors} row{totalErrors === 1 ? '' : 's'} need attention before import.
            </div>
          )}

          <div className="candidate-review-list">
            {rowsFlat.map((candidate: any, idx: number) => (
              <div className="candidate-review-card" key={`${candidate.email || candidate.name || 'candidate'}-${idx}`}>
                <div className="candidate-review-top">
                  <div className="candidate-index">{idx + 1}</div>
                  <div className="candidate-review-title">
                    <strong>{valueOrDash(candidate.name)}</strong>
                    <span>{valueOrDash(candidate.role || candidate.job_role)}</span>
                  </div>
                  <span className={`badge ${statusClass(candidate.selstatus)}`}>
                    {valueOrDash(candidate.selstatus)}
                  </span>
                </div>

                <div className="candidate-form-grid">
                  <div className="review-field">
                    <label>Email</label>
                    <div>{valueOrDash(candidate.email)}</div>
                  </div>
                  <div className="review-field">
                    <label>Phone</label>
                    <div>{valueOrDash(candidate.phone)}</div>
                  </div>
                  <div className="review-field">
                    <label>Experience</label>
                    <div>{valueOrDash(candidate.exp || candidate.experience)}</div>
                  </div>
                  <div className="review-field">
                    <label>Current CTC</label>
                    <div>{valueOrDash(candidate.cctc || candidate.current_ctc)}</div>
                  </div>
                  <div className="review-field">
                    <label>Expected CTC</label>
                    <div>{valueOrDash(candidate.ectc || candidate.expected_ctc)}</div>
                  </div>
                  <div className="review-field">
                    <label>Location</label>
                    <div>{valueOrDash(candidate.location || candidate.current_location)}</div>
                  </div>
                  <div className="review-field">
                    <label>Notice period</label>
                    <div>{valueOrDash(candidate.np || candidate.notice_period)}</div>
                  </div>
                  <div className="review-field">
                    <label>Interview availability</label>
                    <div>{valueOrDash(candidate.availability)}</div>
                  </div>
                  <div className="review-field span-2">
                    <label>Interview status</label>
                    <div>{valueOrDash(candidate.intstatus)}</div>
                  </div>
                  <div className="review-field span-2">
                    <label>Remarks</label>
                    <div>{valueOrDash(candidate.remarks)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
