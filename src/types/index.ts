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
  np?: string
  availability?: string
  intstatus?: string
  selstatus?: string
  remarks?: string
  f2f?: string
  experience?: number
  current_company?: string
  current_location?: string
  preferred_location?: string
  skills?: string
  notice_period?: string
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
  status?: 'Open' | 'Closed' | string
  desc?: string
}
