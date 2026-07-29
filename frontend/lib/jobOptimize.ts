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

/**
 * t_offset_sec을 실제 시각 문자열로 변환한다.
 * job.started_at + t_offset_sec → "12:04:02"
 */
export function formatOffsetTime(startedAt: string | null, offsetSec: number): string {
  if (!startedAt) return '—'
  const t = new Date(new Date(startedAt).getTime() + offsetSec * 1000)
  return t.toLocaleTimeString('ko-KR', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

/** DART 이력을 seq 순서로 정렬 */
export function sortAdjustments(items: HyperparamAdjustmentItem[]) {
  return [...items].sort((a, b) => a.seq - b.seq)
}