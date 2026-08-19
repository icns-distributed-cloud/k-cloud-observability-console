import { CURRENT_USER_ID } from '@/lib/auth'
import type { AssignmentItem, JobSummary, NodePurpose } from '@/app/types'

export interface TimelineBar {
  assignmentId: number
  jobId: number
  nodeId: number
  start: number
  width: number
  job?: JobSummary
  /** 시연 유저(CSC, user_id=1)가 제출한 job인지 - CSP 화면들에서 항상 눈에 띄게 강조한다 */
  isMine: boolean
  /** 아직 안 끝난(to_t === null) 배정인지 - 지금 이 노드를 점유 중인 job이라는 뜻.
   *  행 라벨에 모델명을 붙일지는 이 값으로 정한다 (처리량을 못 가져와 펄스 속도
   *  계산에 실패해도, 지금 뭘 서빙 중인지는 항상 보여줘야 하므로 pulseIntervalSec과
   *  분리해뒀다). */
  isActive: boolean
  /** 지금 이 순간 요청을 받고 있는 추론 막대에만 붙는다 - "펄스 하나 = 요청 약 1000개"
   *  기준으로 처리량(req/s)에서 뽑은 평균 간격(초). 값이 있으면 이 주기로 반복해서
   *  요청 하나가 오른쪽(트랙)에서 왼쪽(노드 라벨)으로 날아드는 것처럼 보여준다. */
  pulseIntervalSec?: number
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

/** 눈금은 구간 시작 기준 경과가 아니라 실제 벽시계 시각으로 표시.
 *  데모용 작업이 15~40초라 표시 구간이 1분 남짓으로 좁아지는데,
 *  그때 시:분만 찍으면 눈금이 전부 같아 보이므로 초까지 표시한다. */
function formatTick(ms: number, withSeconds = false): string {
  return new Date(ms).toLocaleTimeString('ko-KR', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    ...(withSeconds && { second: '2-digit' }),
  })
}

export interface SchedulerSection<T> {
  nodes: T[]
  assignments: AssignmentItem[]
}

/* 스케줄러 두 섹션(학습/추론)을 나눈다.
 * node.purpose가 용도를 직접 알려주므로, 배정된 작업 타입으로 역산할 필요가 없다.
 * 할당 이력이 없는 유휴 노드도 제 풀에 정확히 들어간다.
 *
 * 라이브 클러스터 노드만 보여준다 - 새 작업은 항상 라이브 클러스터에만 배정되니,
 * 다른 클러스터 노드는 여기 섞여봤자 영원히 빈 트랙일 뿐이다. (예전엔 섹션당 칸
 * 수를 채우려고 부족한 만큼 다른 클러스터 노드로 채웠는데, 그러면 학습처럼 라이브
 * 풀이 딱 맞아떨어지는 섹션은 안 티 나다가, 추론처럼 라이브 풀이 더 작은 섹션에서
 * 수원이 아닌 노드가 섞여 보이는 문제가 있었다.)
 */
export function selectSchedulerNodes<
  T extends { id: number; purpose: NodePurpose; isLive: boolean },
>(
  nodes: T[],
  assignments: AssignmentItem[]
): { train: SchedulerSection<T>; infer: SchedulerSection<T> } {
  const section = (purpose: NodePurpose): SchedulerSection<T> => {
    const pool = nodes.filter((n) => n.purpose === purpose && n.isLive)
    const poolIds = new Set(pool.map((n) => n.id))
    const sectionAssignments = assignments.filter((a) => poolIds.has(a.node_id))

    // 막대 있는 노드를 위로 - sort는 안정 정렬이라 동률(둘 다 유휴)이면 원래 순서 유지
    const busyIds = new Set(sectionAssignments.map((a) => a.node_id))
    const ordered = [...pool].sort((a, b) => Number(busyIds.has(b.id)) - Number(busyIds.has(a.id)))

    return { nodes: ordered, assignments: sectionAssignments }
  }

  return { train: section('train'), infer: section('infer') }
}

/** 요청 펄스 하나가 상징하는 실제 요청 수. 처리량을 이 값으로 나눠 펄스 간격을 구한다 -
 *  요청 하나하나를 그리면 처리량이 높을 때 다시 촘촘해져 못 알아보게 된다. */
const REQUESTS_PER_PULSE = 1000

export function buildTimeline(
  assignments: AssignmentItem[],
  jobs: JobSummary[],
  nodes: { id: number; name: string }[],
  nowMs: number,
  /** jobId -> 현재 처리량(req/s). 지금 요청을 받고 있는 추론 job에 대해서만 넘긴다. */
  pulseRatesByJobId?: Map<number, number>
): TimelineData | null {
  if (nodes.length === 0) return null

  const jobById = new Map(jobs.map((j) => [j.id, j]))
  const relevant = assignments.filter((a) => nodes.some((n) => n.id === a.node_id))

  // 할당이 없어도 노드 행은 보여준다 (빈 트랙)
  const starts = relevant.map((a) => new Date(a.from_t).getTime())
  const ends = relevant.map((a) => (a.to_t === null ? nowMs : new Date(a.to_t).getTime()))

  // 최근 구간만 표시 (오래된 이력은 잘라냄)
  const WINDOW_MS = 2 * 60 * 1000
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
        // 아직 안 끝난(to_t === null) 배정만 "지금 요청을 받고 있다" - 과거 배정에
        // 펄스를 붙이면 이미 끝난 서빙이 지금도 요청을 받는 것처럼 보인다.
        const rate = a.to_t === null ? pulseRatesByJobId?.get(a.job_id) : undefined
        return {
          assignmentId: a.id,
          jobId: a.job_id,
          nodeId: a.node_id,
          start: (s - fromMs) / span,
          width: Math.max((e - s) / span, 0.006),
          job: jobById.get(a.job_id),
          isMine: jobById.get(a.job_id)?.user_id === CURRENT_USER_ID,
          isActive: a.to_t === null,
          pulseIntervalSec: rate && rate > 0 ? REQUESTS_PER_PULSE / rate : undefined,
        }
      })
      .sort((x, y) => x.start - y.start),
  }))

const tickCount = 6
  const withSeconds = toMs - fromMs < 5 * 60 * 1000
  const ticks = Array.from({ length: tickCount }, (_, i) => {
    const pos = i / (tickCount - 1)
    return { pos, label: formatTick(fromMs + (toMs - fromMs) * pos, withSeconds) }
  })

  const nowPos = nowMs >= fromMs && nowMs <= toMs ? (nowMs - fromMs) / span : null

  return { rows, fromMs, toMs, ticks, nowPos }
}