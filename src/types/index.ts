export type Candidate = {
  id?: string
  role?: string
  applied_job_id?: string
  applied_job_title?: string
  name: string
  date?: string
  exp?: string
  cctc?: string | number
  ectc?: string | number
  email: string
  phone: string
  linkedin?: string
  location?: string
  np?: string | NoticePeriodOption
  availability?: string
  intstatus?: string
  selstatus?: string
  remarks?: string
  f2f?: string
  interview_slot?: string
  confirmed_availability?: string
  experience?: number
  current_company?: string
  current_location?: string
  preferred_location?: string
  skills?: string
  notice_period?: string | NoticePeriodOption
  current_ctc?: number
  expected_ctc?: number
  resume?: string
  sheet_name?: string
  job_role?: string
  created_at?: string
}

export type UploadRecord = {
  id?: string
  file_name: string
  uploaded_by?: string
  uploaded_date?: string
  total_records?: number
  successful_records?: number
  failed_records?: number
}

export type Job = {
  id?: string
  title: string
  openings?: number
  location?: string
  posted?: string
  status?: 'draft' | 'open' | 'closed' | string
  desc?: string
  client_id?: string
  client_name?: string
}

export type NoticePeriodOption = 'Immediate' | '15 Days' | '30 Days' | '60 Days' | '90 Days'
