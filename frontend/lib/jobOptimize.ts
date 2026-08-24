import type { HyperparamAdjustmentItem, JobSummary, ReallocationItem } from '@/app/types'

/** 초 → "21.4h" 형태로 변환 */
export function formatMakespan(sec: string | null): string {
  if (sec === null) return '—'
  const hours = Number(sec) / 3600
  return `${hours.toFixed(1)}h`
}

/** 재할당 집계: 자원 변경 횟수, 중단 시간 합, 재개 지연 합 */
export function summarizeReallocations(items: ReallocationItem[]) {
  return {
    count: items.length,
    downtimeSec: items.reduce((sum, r) => sum + Number(r.downtime_sec), 0),
    resumeDelaySec: items.reduce((sum, r) => sum + Number(r.resume_delay_sec), 0),
  }
}

/** DART 이력을 seq 순서로 정렬 */
export function sortAdjustments(items: HyperparamAdjustmentItem[]) {
  return [...items].sort((a, b) => a.seq - b.seq)
}

/** 지금 시각까지 "실제로 일어난" DART 조정만 골라낸다. 백엔드는 job 생성 시점에
 *  체인 전체(a->b->c->...)를 미리 시드해두므로, 그대로 다 보여주면 아직 학습이
 *  절반도 안 지났는데 마지막 조정까지 한꺼번에 나타나 버린다 - job.started_at +
 *  t_offset_sec이 nowMs를 넘는(아직 안 지난) 항목은 숨겨서, 페이지를 열어두면
 *  체인이 실제로 하나씩 이어지는 것처럼 보이게 한다. 완료된 job은 finished_at을
 *  기준으로 삼아(더 이상 nowMs가 흘러도 안 늘어나게) 항상 전체 이력을 보여준다.
 */
export function visibleAdjustments(
  items: HyperparamAdjustmentItem[],
  job: JobSummary,
  nowMs: number
): HyperparamAdjustmentItem[] {
  if (!job.started_at) return []
  const startedMs = new Date(job.started_at).getTime()
  const cutoffMs = job.finished_at ? new Date(job.finished_at).getTime() : nowMs
  return sortAdjustments(items).filter((a) => startedMs + a.t_offset_sec * 1000 <= cutoffMs)
}

export interface AdjustmentChain {
  paramName: string
  /** 시간순으로 이어붙인 값들 - [최초 from_value, ...지금까지 지난 조정의 to_value] */
  values: string[]
  /** 가장 최근으로 "지난" 조정의 보상 - 아직 한 번도 안 바뀌었으면 null */
  latestReward: string | null
}

/** 파라미터별로 한 줄짜리 체인("1e-3 → 6e-4 → 8e-4 → ...")을 만든다. 4개 파라미터
 *  모두 job 생성 시점부터 이미 존재한다는 걸 보여주기 위해, 아직 한 번도 안 바뀐
 *  파라미터도 초기값(from_value) 하나짜리 줄로 처음부터 표시한다 - 그래서 "어떤
 *  이벤트가 있었는지"(all, 시간과 무관하게 전체)로 파라미터 목록과 초기값을
 *  정하고, "지금까지 지난 것"(visible, visibleAdjustments가 걸러준 것)만큼만 값을
 *  이어붙인다. all을 seq 순으로 훑으면서 파라미터별 첫 등장에서 초기값을 만들고,
 *  그 이벤트가 visible에도 있으면(=이미 지났으면) to_value를 이어붙이는 식이다. */
export function chainAdjustments(
  all: HyperparamAdjustmentItem[],
  visible: HyperparamAdjustmentItem[]
): AdjustmentChain[] {
  const visibleIds = new Set(visible.map((a) => a.id))
  const chains = new Map<string, AdjustmentChain>()
  for (const a of sortAdjustments(all)) {
    let chain = chains.get(a.param_name)
    if (!chain) {
      chain = { paramName: a.param_name, values: [a.from_value], latestReward: null }
      chains.set(a.param_name, chain)
    }
    if (visibleIds.has(a.id)) {
      chain.values.push(a.to_value)
      chain.latestReward = a.reward
    }
  }
  return [...chains.values()]
}