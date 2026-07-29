import type { AssignmentItem, JobSummary, JobType } from '@/app/types'

/** 작업 타입별 색상 */
export const JOB_COLORS: Record<JobType, string> = {
  train: '#6366F1',
  infer: '#D97706',
  distributed: '#2DD4BF',
}

/** 작업 상태 라벨 */
export const JOB_STATUS_LABELS: Record<string, string> = {
  queued: '대기중',
  running: '실행중',
  done: '완료',
}

/**
 * 노드별 현재 실행 중인 작업을 매핑한다.
 * to_t가 null인 assignment가 현재 점유 중인 할당.
 */
export function mapNodeJobs(
  assignments: AssignmentItem[],
  jobs: JobSummary[]
): Record<number, JobSummary | undefined> {
  const jobById = new Map(jobs.map((j) => [j.id, j]))
  const result: Record<number, JobSummary | undefined> = {}

  for (const a of assignments) {
    if (a.to_t !== null) continue        // 이미 끝난 할당은 건너뜀
    result[a.node_id] = jobById.get(a.job_id)
  }

  return result
}

/** 우선순위 선호 라벨 */
export const PRIORITY_LABELS: Record<string, string> = {
  time: '시간 우선',
  cost: '비용 우선',
  balanced: '균형',
}