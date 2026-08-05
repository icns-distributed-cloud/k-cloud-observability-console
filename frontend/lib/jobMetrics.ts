import type { JobMetricProfileItem, JobSummary, JobType } from '@/app/types'

/**
 * 작업 타입별 가정 소요 시간(초).
 * 백엔드에 실제 소요 시간 정보가 없어 협의된 값으로 고정.
 */
export const DURATION_SEC: Record<JobType, number> = {
    train: 40,
    infer: 15,
}

/**
 * 작업의 현재 진행률(0~1)을 계산한다.
 * (지금 시각 - started_at) / 타입별 총 소요시간
 */
export function jobProgress(job: JobSummary, nowMs: number): number {
    if (job.status === 'done') return 1
    if (job.status === 'queued' || !job.started_at) return 0

    const startedMs = new Date(job.started_at).getTime()
    const elapsedSec = (nowMs - startedMs) / 1000
    return Math.max(0, Math.min(1, elapsedSec / DURATION_SEC[job.type]))
}

/**
 * 경과 시간 라벨. 시작 전이면 "—", 완료된 작업은 finished_at까지.
 * jobProgress와 달리 가정 소요시간이 아니라 실제 타임스탬프를 쓴다.
 */
export function elapsedLabel(job: JobSummary, nowMs: number): string {
    if (!job.started_at) return '—'

    const end = job.finished_at ? new Date(job.finished_at).getTime() : nowMs
    const sec = Math.max(0, (end - new Date(job.started_at).getTime()) / 1000)
    const h = Math.floor(sec / 3600)
    const m = Math.floor((sec % 3600) / 60)
    const s = Math.floor(sec % 60)

    if (h > 0) return `${h}h ${m}m`
    if (m > 0) return `${m}m ${s}s`
    return `${s}s`
}

/**
 * 곡선 형태에 따라 진행률을 보간 비율로 변환한다.
 * - exp_approach: 초반에 빠르게 오르고 점점 완만해짐
 * - flat: 거의 안 변함 (미세 변동만)
 */
function curveFactor(shape: string | null, progress: number): number {
    if (shape === 'exp_approach') return 1 - Math.exp(-3 * progress)
    if (shape === 'flat') return progress * 0.05
    return 1
}

/** 지표의 현재 값을 계산한다. curve_shape가 null이면 고정값. */
export function metricCurrentValue(
    metric: JobMetricProfileItem,
    progress: number
): number | null {
    const target = metric.target_value === null ? null : Number(metric.target_value)
    if (target === null) return null

    const start = metric.start_value === null ? target : Number(metric.start_value)
    if (metric.curve_shape === null) return target

    return start + (target - start) * curveFactor(metric.curve_shape, progress)
}

/** 카드에 표시할 문자열. total_count가 있으면 "32/50" 형태. */
export function metricDisplay(
    metric: JobMetricProfileItem,
    progress: number
): { value: string; unit: string | null } {
    if (metric.total_count !== null) {
        const current = Math.round(progress * metric.total_count)
        return { value: `${current}/${metric.total_count}`, unit: metric.unit }
    }

    const v = metricCurrentValue(metric, progress)
    if (v === null) return { value: '—', unit: metric.unit }

    // 요청당 전력(0.42 J)처럼 1 미만인 지표는 소수 1자리로는 유효숫자가 사라진다
    return { value: v.toFixed(Math.abs(v) < 1 ? 2 : 1), unit: metric.unit }
}

/** featured 지표의 시계열 (과거 ~ 현재). 큰 그래프용. */
export function metricSeries(
    metric: JobMetricProfileItem,
    progress: number,
    points = 30
): number[] {
    return Array.from({ length: points }, (_, i) => {
        const p = (progress * i) / (points - 1)
        return metricCurrentValue(metric, p) ?? 0
    })
}