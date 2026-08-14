import { useQuery } from '@tanstack/react-query'
import { CandidateService } from '../services/candidateService'
import { JobService } from '../services/jobService'

export type DashboardCandidate = Record<string, any>
export type DashboardJob = Record<string, any>

type DashboardPayload = {
  candidates: DashboardCandidate[]
  jobs: DashboardJob[]
}

async function fetchDashboardData(): Promise<DashboardPayload> {
  const [{ data: candidates }, jobs] = await Promise.all([
    CandidateService.list(1, 2000),
    JobService.list()
  ])

  return {
    candidates: candidates || [],
    jobs: jobs || []
  }
}

export function useRecruitmentDashboard() {
  const query = useQuery(['recruitment-dashboard-data'], fetchDashboardData, {
    retry: false,
    staleTime: 30 * 1000
  })

  return {
    candidates: query.data?.candidates || [],
    jobs: query.data?.jobs || [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error as Error | null,
    refetch: query.refetch
  }
}
