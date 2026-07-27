const FUNCTIONS_BASE = import.meta.env.VITE_FUNCTIONS_BASE || '/functions/v1'
const API_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

async function call(path: string, method = 'GET', body?: any) {
  const url = `${FUNCTIONS_BASE}${path}`
  const opts: any = { method, headers: { 'Content-Type': 'application/json' } }
  if (API_KEY) opts.headers['apikey'] = API_KEY
  if (body) opts.body = JSON.stringify(body)
  const res = await fetch(url, opts)
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error((data && data.error) ? data.error : `HTTP ${res.status}`)
  return data
}

export async function listJobs(page = 1, perPage = 50) {
  return call(`/jobs?page=${page}&perPage=${perPage}`)
}

export async function getJob(id: string) {
  return call(`/jobs/${id}`)
}

export async function createJob(job: any) {
  return call('/jobs', 'POST', { job })
}

export async function updateJob(id: string, job: any) {
  return call(`/jobs/${id}`, 'PATCH', { job })
}

export async function deleteJob(id: string) {
  return call(`/jobs/${id}`, 'DELETE')
}

export async function applyToJob(jobId: string, application: any) {
  return call(`/jobs/${jobId}/apply`, 'POST', { application })
}

export async function listApplicationsForJob(jobId: string) {
  return call(`/jobs/${jobId}/applications`)
}

export async function getApplication(id: string) {
  return call(`/applications/${id}`)
}

export async function updateApplication(id: string, application: any) {
  return call(`/applications/${id}`, 'PATCH', { application })
}

export async function deleteApplication(id: string) {
  return call(`/applications/${id}`, 'DELETE')
}

export default {
  listJobs, getJob, createJob, updateJob, deleteJob,
  applyToJob, listApplicationsForJob, getApplication, updateApplication, deleteApplication
}
