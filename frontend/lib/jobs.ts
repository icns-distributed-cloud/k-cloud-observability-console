import type { AssignmentItem, JobSummary, JobType } from '@/app/types'

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

export interface JobResources {
  /** 이 작업이 쓴(쓰고 있는) 노드 이름 */
  nodes: string[]
  /** 그 노드들의 가속기 구성. 예: "GPU×2 + NPU×1" */
  mix: string
  /** 누적 비용(USD). 단가 0인 클러스터만 쓴 작업은 0 */
  cost: number
}

/** 구성 표기 순서 (그 외 종류는 뒤로) */
const KIND_ORDER = ['GPU', 'NPU', 'PIM']
const kindRank = (k: string) => {
  const i = KIND_ORDER.indexOf(k)
  return i === -1 ? KIND_ORDER.length : i
}

interface NodeInfo {
  id: number
  name: string
  cluster_id: number
  accelerators: { kind: string; count: number }[]
}

/**
 * 작업별 배정 노드 · 가속기 구성 · 누적 비용을 만든다. (mapNodeJobs의 반대 방향)
 * 끝난 할당(to_t != null)도 포함한다 — 완료된 작업도 어디서 얼마에 돌았는지 보여야 한다.
 * 비용 = Σ(노드 점유 시간 × 그 노드가 속한 클러스터의 시간당 단가).
 * 진행 중 작업은 nowMs까지로 계산하므로 화면 틱마다 다시 부르면 값이 흐른다.
 */
export function jobResources(
  assignments: AssignmentItem[],
  nodes: NodeInfo[],
  costPerHourByCluster: Record<number, number>,
  nowMs: number
): Record<number, JobResources> {
  const nodeById = new Map(nodes.map((n) => [n.id, n]))
  const result: Record<number, JobResources> = {}
  const kinds: Record<number, Record<string, number>> = {}
  const seen = new Set<string>()         // `job:node` — 노드는 한 번만 센다

  for (const a of assignments) {
    const node = nodeById.get(a.node_id)
    if (!node) continue                  // 조회 실패한 노드

    const r = (result[a.job_id] ??= { nodes: [], mix: '', cost: 0 })
    const end = a.to_t === null ? nowMs : new Date(a.to_t).getTime()
    const hours = Math.max(0, end - new Date(a.from_t).getTime()) / 3_600_000
    r.cost += hours * (costPerHourByCluster[node.cluster_id] ?? 0)

    const key = `${a.job_id}:${a.node_id}`
    if (seen.has(key)) continue
    seen.add(key)
    r.nodes.push(node.name)
    const k = (kinds[a.job_id] ??= {})
    for (const acc of node.accelerators) k[acc.kind] = (k[acc.kind] ?? 0) + acc.count
  }

  for (const [jobId, k] of Object.entries(kinds)) {
    result[Number(jobId)].mix = Object.keys(k)
      .sort((a, b) => kindRank(a) - kindRank(b))
      .map((kind) => `${kind}×${k[kind]}`)
      .join(' + ')
  }

  return result
}

/** 우선순위 선호 라벨 */
export const PRIORITY_LABELS: Record<string, string> = {
  time: '시간 우선',
  cost: '비용 우선',
  balanced: '균형',
}