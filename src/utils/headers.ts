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
  'notice_period',
  'intstatus',
  'selstatus',
  'remarks',
  'interview_slot',
  'profile_sourcing',
  'consultant',
  'confirmed_availability',
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
  date: 'Date of submission',
  name: 'Candidate Name',
  experience: 'Relevant experience',
  current_ctc: 'C-CTC',
  expected_ctc: 'E-CTC',
  email: 'Email id',
  phone: 'Phone number',
  linkedin: 'Linkedin profile',
  current_location: 'Current Location',
  notice_period: 'NP',
  intstatus: 'Interview Status',
  selstatus: 'Selection Status',
  remarks: 'Remarks',
  interview_slot: 'Interview slot given by client',
  confirmed_availability: 'Candidates confirmed availability',
  f2f: 'F2F interview availability'
  ,consultant: 'Consultant Name'
}

export const CANDIDATE_HEADER_LABELS = CANDIDATE_HEADERS.map(h => LABEL_OVERRIDES[h] || toTitle(h))

export default CANDIDATE_HEADERS
