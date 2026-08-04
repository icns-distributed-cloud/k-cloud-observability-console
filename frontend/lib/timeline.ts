import type { AssignmentItem, JobSummary, NodePurpose } from '@/app/types'

export interface TimelineBar {
  assignmentId: number
  jobId: number
  nodeId: number
  start: number
  width: number
  job?: JobSummary
  isNew: boolean
}

export interface TimelineRow {
  nodeId: number
  nodeName: string
  bars: TimelineBar[]
}

export interface TimelineData {
  rows: TimelineRow[]
  fromMs: number
  toMs: number
  ticks: { pos: number; label: string }[]
  nowPos: number | null
}

/** 눈금은 구간 시작 기준 경과가 아니라 실제 벽시계 시각으로 표시 */
function formatTick(ms: number): string {
  return new Date(ms).toLocaleTimeString('ko-KR', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  })
}

export interface SchedulerSection<T> {
  nodes: T[]
  assignments: AssignmentItem[]
}

/* 스케줄러 두 섹션(학습/추론)을 나눈다.
 * node.purpose가 용도를 직접 알려주므로, 배정된 작업 타입으로 역산할 필요가 없다.
 * 할당 이력이 없는 유휴 노드도 제 풀에 정확히 들어간다.
 * 막대가 있는 노드를 앞에 두어 perSection으로 잘라도 활동이 먼저 보이게 한다.
 */
export function selectSchedulerNodes<T extends { id: number; purpose: NodePurpose }>(
  nodes: T[],
  assignments: AssignmentItem[],
  perSection = 4
): { train: SchedulerSection<T>; infer: SchedulerSection<T> } {
  const section = (purpose: NodePurpose): SchedulerSection<T> => {
    const pool = nodes.filter((n) => n.purpose === purpose)
    const poolIds = new Set(pool.map((n) => n.id))
    const sectionAssignments = assignments.filter((a) => poolIds.has(a.node_id))

    const busyIds = new Set(sectionAssignments.map((a) => a.node_id))
    const ordered = [
      ...pool.filter((n) => busyIds.has(n.id)),
      ...pool.filter((n) => !busyIds.has(n.id)),
    ]

    return { nodes: ordered.slice(0, perSection), assignments: sectionAssignments }
  }

  return { train: section('train'), infer: section('infer') }
}

export function buildTimeline(
  assignments: AssignmentItem[],
  jobs: JobSummary[],
  nodes: { id: number; name: string }[],
  nowMs: number,
  highlightJobId?: number | null
): TimelineData | null {
  if (nodes.length === 0) return null

  const jobById = new Map(jobs.map((j) => [j.id, j]))
  const relevant = assignments.filter((a) => nodes.some((n) => n.id === a.node_id))

  // 할당이 없어도 노드 행은 보여준다 (빈 트랙)
  const starts = relevant.map((a) => new Date(a.from_t).getTime())
  const ends = relevant.map((a) => (a.to_t === null ? nowMs : new Date(a.to_t).getTime()))

  // 최근 구간만 표시 (오래된 이력은 잘라냄)
  const WINDOW_MS = 15 * 60 * 1000
  const earliest = starts.length > 0 ? Math.min(...starts) : nowMs - WINDOW_MS
  const rawFrom = Math.max(earliest, nowMs - WINDOW_MS)
  const rawTo = ends.length > 0 ? Math.max(...ends, nowMs) : nowMs
  // 오른쪽에 여유 공간(15%)을 둬서 새 작업이 들어올 자리를 남긴다
  const base = rawTo - rawFrom || 60_000
  const fromMs = rawFrom - base * 0.03
  const toMs = rawTo + base * 0.18
  const span = toMs - fromMs || 1

  const rows: TimelineRow[] = nodes.map((n) => ({
    nodeId: n.id,
    nodeName: n.name,
    bars: relevant
      .filter((a) => {
        if (a.node_id !== n.id) return false
        const e = a.to_t === null ? nowMs : new Date(a.to_t).getTime()
        return e >= fromMs   // 구간 시작 전에 이미 끝난 건 제외
      })
      .map((a) => {
        const rawS = new Date(a.from_t).getTime()
        const rawE = a.to_t === null ? nowMs : new Date(a.to_t).getTime()
        // 표시 구간으로 클램프
        const s = Math.max(rawS, fromMs)
        const e = Math.min(rawE, toMs)
        return {
          assignmentId: a.id,
          jobId: a.job_id,
          nodeId: a.node_id,
          start: (s - fromMs) / span,
          width: Math.max((e - s) / span, 0.006),
          job: jobById.get(a.job_id),
          isNew: highlightJobId != null && a.job_id === highlightJobId,
        }
      })
      .sort((x, y) => x.start - y.start),
  }))

  const tickCount = 6
  const ticks = Array.from({ length: tickCount }, (_, i) => {
    const pos = i / (tickCount - 1)
    return { pos, label: formatTick(fromMs + (toMs - fromMs) * pos) }
  })

  const nowPos = nowMs >= fromMs && nowMs <= toMs ? (nowMs - fromMs) / span : null

  return { rows, fromMs, toMs, ticks, nowPos }
}