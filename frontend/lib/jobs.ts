import type { AssignmentItem, JobSummary, JobType, SelectedTierSummary } from '@/app/types'

/** 작업 타입별 색상 */
export const JOB_COLORS: Record<JobType, string> = {
  train: 'var(--job-train)',
  infer: 'var(--job-infer)',
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

/** 구성 표기 순서 (그 외 종류는 뒤로) */
const KIND_ORDER = ['GPU', 'NPU', 'PIM']
const kindRank = (k: string) => {
  const i = KIND_ORDER.indexOf(k)
  return i === -1 ? KIND_ORDER.length : i
}

/**
 * Tier 요구 구성을 "GPU×2 + NPU×1" 형태로 표기한다.
 * 목록 응답의 selected_tier에 이미 들어 있어 노드를 따로 조회할 필요가 없다.
 */
export function tierMix(tier: SelectedTierSummary | null): string {
  if (!tier || tier.requirements.length === 0) return ''
  return [...tier.requirements]
    .sort((a, b) => kindRank(a.kind) - kindRank(b.kind))
    .map((r) => `${r.kind}×${r.node_count}`)
    .join(' + ')
}

/**
 * 누적 비용 = 경과 시간 × Tier 시간당 단가.
 * 예전에는 노드별 점유시간 × 클러스터 단가를 합산했지만, 이제 과금 단위가
 * 작업이 선택한 Tier라 단가 하나로 끝난다.
 * 진행 중 작업은 nowMs까지로 계산하므로 매 틱 다시 부르면 값이 흐른다.
 */
export function jobCost(job: JobSummary, nowMs: number): number {
  if (!job.selected_tier || job.started_at === null) return 0
  const end = job.finished_at === null ? nowMs : new Date(job.finished_at).getTime()
  const hours = Math.max(0, end - new Date(job.started_at).getTime()) / 3_600_000
  return hours * Number(job.selected_tier.cost_per_hour)
}

/** 우선순위 선호 라벨 */
export const PRIORITY_LABELS: Record<string, string> = {
  time: '시간 우선',
  cost: '비용 우선',
  balanced: '균형',
}