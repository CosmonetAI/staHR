// Canonical header keys in the specific order requested by the user
export const CANDIDATE_HEADERS = [
  'job_id',
  'date',
  'role',
  'name',
  'experience',
  'current_ctc',
  'expected_ctc',
  'email',
  'phone',
  'linkedin',
  'current_location',
  'availability',
  'notice_period',
  'intstatus',
  'selstatus',
  'remarks',
  'f2f'
]

function toTitle(s: string) {
  return s
    .replace(/_/g, ' ')
    .split(' ')
    .map(w => w ? w[0].toUpperCase() + w.slice(1) : '')
    .join(' ')
}

const LABEL_OVERRIDES: Record<string, string> = {
  job_id: 'Job Id',
  current_ctc: 'Current CTC',
  expected_ctc: 'Expected CTC',
  linkedin: 'LinkedIn Profile',
  notice_period: 'Notice Period',
  intstatus: 'Interview Status',
  selstatus: 'Selection Status',
  f2f: 'F2F'
}

export const CANDIDATE_HEADER_LABELS = CANDIDATE_HEADERS.map(h => LABEL_OVERRIDES[h] || toTitle(h))

export default CANDIDATE_HEADERS
