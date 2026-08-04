import type { AssignmentItem, JobSummary, JobType } from '@/app/types'

/** 작업 타입별 색상 */
export const JOB_COLORS: Record<JobType, string> = {
  train: 'var(--job-train)',
  infer: 'var(--job-infer)',
  distributed: 'var(--job-distributed)',
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

/**
 * 작업별 현재 점유 중인 노드 이름을 매핑한다. (mapNodeJobs의 반대 방향)
 * 한 작업이 여러 노드에 걸칠 수 있어 배열로 돌려준다.
 */
export function mapJobNodes(
  assignments: AssignmentItem[],
  nodes: { id: number; name: string }[]
): Record<number, string[]> {
  const nameById = new Map(nodes.map((n) => [n.id, n.name]))
  const seen = new Set<string>()
  const result: Record<number, string[]> = {}

  for (const a of assignments) {
    if (a.to_t !== null) continue        // 이미 끝난 할당은 건너뜀
    const name = nameById.get(a.node_id)
    if (!name) continue                  // 조회 실패한 클러스터의 노드
    const key = `${a.job_id}:${a.node_id}`
    if (seen.has(key)) continue
    seen.add(key)
    ;(result[a.job_id] ??= []).push(name)
  }

  return result
}

/** 우선순위 선호 라벨 */
export const PRIORITY_LABELS: Record<string, string> = {
  time: '시간 우선',
  cost: '비용 우선',
  balanced: '균형',
}