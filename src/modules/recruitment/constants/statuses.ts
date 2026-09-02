export const CANDIDATE_STATUSES = [
  'Pre-screening in-progress',
  'Pre-screening done and submitted for evaluation',
  'Evaluation in-progress',
  'Evaluation done and submitted for sharing with client',
  'Profile shared with client',
  'Scheduled for L1 discussion',
  'Scheduled for L2 discussion',
  'Scheduled for L3 discussion',
  'Candidate shortlisted',
  'On hold',
  'Rejected',
  'Dropped Out'
] as const

export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number]

export const STATUS_SHORT_LABEL: Record<CandidateStatus, string> = {
  'Pre-screening in-progress': 'Pre-screening',
  'Pre-screening done and submitted for evaluation': 'Pre-screening (Done)',
  'Evaluation in-progress': 'Evaluation',
  'Evaluation done and submitted for sharing with client': 'Evaluation (Done)',
  'Profile shared with client': 'Client Shared',
  'Scheduled for L1 discussion': 'L1',
  'Scheduled for L2 discussion': 'L2',
  'Scheduled for L3 discussion': 'L3',
  'Candidate shortlisted': 'Shortlisted',
  'On hold': 'On hold',
  'Rejected': 'Rejected',
  'Dropped Out': 'Dropped Out'
}

export const STATUS_COLORS: Record<CandidateStatus, string> = {
  'Pre-screening in-progress': '#60A5FA',
  'Pre-screening done and submitted for evaluation': '#3B82F6',
  'Evaluation in-progress': '#A78BFA',
  'Evaluation done and submitted for sharing with client': '#7C3AED',
  'Profile shared with client': '#06B6D4',
  'Scheduled for L1 discussion': '#F59E0B',
  'Scheduled for L2 discussion': '#F97316',
  'Scheduled for L3 discussion': '#FB923C',
  'Candidate shortlisted': '#22C55E',
  'On hold': '#FBBF24',
  'Rejected': '#EF4444',
  'Dropped Out': '#64748B'
}

// Funnel stages and the statuses that count towards them (excluding On hold / Rejected / Dropped Out)
export const FUNNEL_STAGES = [
  { key: 'applications', label: 'Applications', statuses: [] },
  { key: 'pre_screening', label: 'Pre-screening', statuses: [
    'Pre-screening in-progress',
    'Pre-screening done and submitted for evaluation'
  ] },
  { key: 'evaluation', label: 'Evaluation', statuses: [
    'Evaluation in-progress',
    'Evaluation done and submitted for sharing with client'
  ] },
  { key: 'client_sharing', label: 'Client Sharing', statuses: ['Profile shared with client'] },
  { key: 'l1', label: 'L1 Discussion', statuses: ['Scheduled for L1 discussion'] },
  { key: 'l2', label: 'L2 Discussion', statuses: ['Scheduled for L2 discussion'] },
  { key: 'l3', label: 'L3 Discussion', statuses: ['Scheduled for L3 discussion'] },
  { key: 'shortlisted', label: 'Shortlisted', statuses: ['Candidate shortlisted'] }
] as const

export const IN_PIPELINE_STATUSES: CandidateStatus[] = [
  'Pre-screening in-progress',
  'Pre-screening done and submitted for evaluation',
  'Evaluation in-progress',
  'Evaluation done and submitted for sharing with client',
  'Profile shared with client',
  'Scheduled for L1 discussion',
  'Scheduled for L2 discussion',
  'Scheduled for L3 discussion',
  'Candidate shortlisted'
]

export const CLOSED_OUT_STATUSES: CandidateStatus[] = ['Rejected', 'Dropped Out']

export function isPipelineStatus(s: string) {
  return IN_PIPELINE_STATUSES.includes(s as CandidateStatus)
}

export function statusToFunnelKey(s: string): string {
  const label = String(s || '').trim()
  if (!label) return 'applications'
  for (const stage of FUNNEL_STAGES) {
    if (stage.statuses.includes(label as CandidateStatus)) return stage.key
  }
  // Default: if status is closed out or on hold, don't map to funnel progression
  return 'applications'
}
