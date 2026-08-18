import type { JobMetricProfileItem, JobSummary, JobType, JobStatus } from '@/app/types'

/**
 * 작업 타입별 가정 소요 시간(초).
 * 백엔드에 실제 소요 시간 정보가 없어 협의된 값으로 고정.
 */
export const DURATION_SEC: Record<JobType, number> = {
    train: 40,
    infer: 15,
}

/** 실제 추론 작업은 서빙처럼 계속 돈다 (백엔드가 자동 종료하지 않음).
 *  진행률 개념이 없으므로 화면에서 막대 대신 "지속 실행"으로 표시한다.
 *  데모 필러는 duration_sec을 갖고 순환하지만 목록에 안 나오므로 여기선 무관. */
export function isContinuous(job: { type: JobType; status: JobStatus }): boolean {
    return job.type === 'infer' && job.status === 'running'
}

/** 완료된 추론 작업은 진행률 개념이 무의미하므로 막대·퍼센트를 모두 숨긴다. */
export function hidesProgress(job: { type: JobType; status: JobStatus }): boolean {
    return job.type === 'infer' && job.status === 'done'
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

/** 실제 추론은 완료 시점이 없어(무기한 실행) job 전체 진행률을 지표 곡선에 못 쓴다 -
 *  jobProgress는 DURATION_SEC['infer']=15초를 기준으로 곧장 1에 고정돼버려서, 처리량
 *  같은 지표가 웜업도 없이 바로 목표치를 찍고, 그 뒤로도 "0~1 전체" 구간을 매번 다시
 *  그리는 탓에 계속 오르는 것처럼 보였다. 대신 짧은 웜업 구간(실제 서빙이 초반에
 *  안정화되는 것과 같은 모양)만 갖고, 그 이후로는 목표치에서 그대로 유지된다.
 *  학습은 실제로 끝이 있는 작업이라 기존 jobProgress를 그대로 쓴다. */
const INFER_WARMUP_SEC = 20

export function metricProgress(job: JobSummary, nowMs: number): number {
    if (job.type === 'train') return jobProgress(job, nowMs)
    if (!job.started_at || job.status === 'queued') return 0

    const elapsedSec = (nowMs - new Date(job.started_at).getTime()) / 1000
    return Math.max(0, Math.min(1, elapsedSec / INFER_WARMUP_SEC))
}

/** 상한이 없는 누적 카운터(예: 누적 요청 수). ratePerSec(보통 처리량 지표의 목표치,
 *  req/s 같은 실측 단위)를 실제 경과 시간에 곱해서, 시간이 지날수록 계속 늘어나게 한다.
 *  total_count를 상한으로 쓰던 예전 방식은 진행률이 1에서 멈추는 순간 카운터도 같이
 *  멈춰서(예: "12000/12000") 계속 도는 서빙 작업에는 안 맞았다.
 *  finished_at이 있으면(완료됐거나 stop된 job) 거기서 경과 시간을 멈춘다 - elapsedLabel과
 *  같은 이유로, 안 그러면 이미 끝난 job도 상세페이지를 볼 때마다 숫자가 계속 불어난다. */
export function cumulativeCount(ratePerSec: number, job: JobSummary, nowMs: number): number {
    if (!job.started_at) return 0
    const end = job.finished_at ? new Date(job.finished_at).getTime() : nowMs
    const elapsedSec = Math.max(0, (end - new Date(job.started_at).getTime()) / 1000)
    return Math.round(ratePerSec * elapsedSec)
}

function formatDuration(sec: number): string {
    const h = Math.floor(sec / 3600)
    const m = Math.floor((sec % 3600) / 60)
    const s = Math.floor(sec % 60)

    if (h > 0) return `${h}h ${m}m`
    if (m > 0) return `${m}m ${s}s`
    return `${s}s`
}

/**
 * 경과 시간 라벨. 시작 전이면 "—", 완료된 작업은 finished_at까지.
 * jobProgress와 달리 가정 소요시간이 아니라 실제 타임스탬프를 쓴다.
 */
export function elapsedLabel(job: JobSummary, nowMs: number): string {
    if (!job.started_at) return '—'

    const end = job.finished_at ? new Date(job.finished_at).getTime() : nowMs
    const sec = Math.max(0, (end - new Date(job.started_at).getTime()) / 1000)
    return formatDuration(sec)
}

/** 대기열에서 기다린 시간 (submitted_at 기준, 아직 배정 전이라는 전제) */
export function waitingLabel(job: JobSummary, nowMs: number): string {
    const sec = Math.max(0, (nowMs - new Date(job.submitted_at).getTime()) / 1000)
    return formatDuration(sec)
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

// 요청당 전력(0.42 J)처럼 1 미만인 지표는 소수 1자리로는 유효숫자가 사라진다
export function formatMetricValue(v: number): string {
    return v.toFixed(Math.abs(v) < 1 ? 2 : 1)
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

    return { value: formatMetricValue(v), unit: metric.unit }
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

const INFER_WINDOW_SEC = 60
const INFER_JITTER_FRAC = 0.07

/** 여러 사인파를 합쳐 "노이즈처럼" 보이는 결정론적 값을 낸다 (진짜 Math.random()이면
 *  매 렌더마다 이미 지나간 구간까지 다시 흔들린다 - (seed, 시각)이 같으면 항상 같은
 *  값이 나와야 창이 옆으로 흘러갈 때 지나간 부분이 안정적으로 유지된다). */
function pseudoJitter(seed: number, t: number): number {
    return (
        Math.sin(t * 0.31 + seed) * 0.5 +
        Math.sin(t * 0.7 + seed * 2.7) * 0.3 +
        Math.sin(t * 1.9 + seed * 5.3) * 0.2
    )
}

/** 추론 지표의 "최근 60초" 슬라이딩 윈도우 시계열. job 진행률로 타임라인 전체를
 *  펼치는 metricSeries와 달리 실제 경과시간 기준으로 최근 구간을 매번 새로 계산해서,
 *  창이 옆으로 흘러가는 것처럼 보이게 한다. 콜드스타트 구간은 목표치로 수렴하는 곡선을
 *  그대로 쓰고, 웜업이 끝난 뒤로는 목표치에서 완전히 평평하지 않고 실제 서빙처럼
 *  자연스럽게 오르내린다. */
export function liveMetricSeries(
    metric: JobMetricProfileItem,
    job: JobSummary,
    nowMs: number,
    points = 30
): number[] {
    const target = metric.target_value === null ? null : Number(metric.target_value)
    if (target === null || !job.started_at) return Array(points).fill(0)

    const startedMs = new Date(job.started_at).getTime()
    const endMs = job.finished_at ? new Date(job.finished_at).getTime() : nowMs
    const windowStartMs = Math.max(startedMs, endMs - INFER_WINDOW_SEC * 1000)

    return Array.from({ length: points }, (_, i) => {
        const atMs = windowStartMs + ((endMs - windowStartMs) * i) / (points - 1)
        const elapsedSec = (atMs - startedMs) / 1000
        const warmup = Math.max(0, Math.min(1, elapsedSec / INFER_WARMUP_SEC))
        const base = metricCurrentValue(metric, warmup) ?? target
        const jitter = warmup >= 1 ? pseudoJitter(job.id, atMs / 1000) * INFER_JITTER_FRAC * target : 0
        return Math.max(0, base + jitter)
    })
}