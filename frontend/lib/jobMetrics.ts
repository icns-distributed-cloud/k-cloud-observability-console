import type { JobMetricProfileItem, JobSummary, JobType, JobStatus } from '@/app/types'
import { pseudoJitter } from '@/lib/metrics'

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

/** job.phase_progress(서버가 계산해서 내려주는 값) 기반 통합 진행률. done→1,
 *  queued→0으로 보정하고, 그 외(provisioning/running/finalizing)는 서버 값을 그대로
 *  쓴다. 예전엔 프론트에서 (지금 시각 - started_at) / 고정 소요시간으로 직접 계산했는데,
 *  job 상태가 queued→provisioning→running→finalizing→done 여러 단계로 나뉘면서
 *  started_at이 "job이 admit된 시각"(=provisioning 시작)이 됐음에도 그 계산은
 *  provisioning/finalizing 구간 길이를 전혀 모르고 여전히 전체 경과시간을 running
 *  소요시간 하나로만 나눴다 - CSC/CSP 양쪽 다 이 값을 쓰는데 폴링 타이밍이 어긋나면
 *  서로 다른 스냅샷을 들고 있어 값이 갈려 보이기도 했다. 백엔드가 단계별 길이를 이미
 *  정확히 알고 계산해 주니, 프론트는 그 값을 그대로 신뢰하는 게 맞다. */
export function phaseProgress(job: JobSummary): number {
    if (job.status === 'done') return 1
    if (job.status === 'queued') return 0
    return job.phase_progress ?? 0
}

/** phase_started_at ~ phase_ends_at 구간을 nowMs 기준으로 보간한 진행률(0~1). 폴링
 *  스냅샷(phase_progress)은 다음 fetchJobDetail이 올 때까지 값이 그대로 멈춰 있다가
 *  한 번에 훌쩍 뛰어서(예: 10초 간격 폴링에 40초짜리 학습이면 25%씩 계단식으로 보임)
 *  막대가 뚝뚝 끊겨 보인다 - 두 시각을 알면 렌더될 때마다(useTime의 매 틱마다) 그
 *  사이값을 직접 계산할 수 있어 폴링 주기와 무관하게 부드럽게 움직인다. 두 시각이
 *  없으면(queued/done/추론 running) 폴링 스냅샷으로 대체한다. */
function livePhaseProgress(job: JobSummary, nowMs: number): number {
    if (!job.phase_started_at || !job.phase_ends_at) return job.phase_progress ?? 0
    const start = new Date(job.phase_started_at).getTime()
    const end = new Date(job.phase_ends_at).getTime()
    if (end <= start) return 1
    return Math.max(0, Math.min(1, (nowMs - start) / (end - start)))
}

/** phaseProgress는 provisioning/running/finalizing 각 "지금 단계"의 진행률을 그대로
 *  돌려준다 - 학습 상세 페이지의 정확도 그래프/진행률 바에 그대로 쓰면, 단계가 바뀔
 *  때마다(대기→준비→실행→마무리) 0%로 리셋됐다가 다시 채워지는 것처럼 보인다. 실제
 *  학습(정확도가 오르는 것)은 running 단계에서만 일어나므로, 그 앞뒤는 단조 증가만
 *  보이게 고정한다 - 준비 중엔 아직 시작 전이니 0, 마무리 중엔 이미 running에서 다
 *  끝난 뒤라 (running→finalizing 전환 때 뚝 떨어져 보이지 않도록) 1로 둔다. 추론은
 *  이 구분이 필요 없어(진행률 개념 자체가 없음) phaseProgress를 그대로 돌려준다.
 *  nowMs가 주어지면(보통 항상 주어짐, useTime이 아직 첫 틱 전일 때만 null) running
 *  구간은 livePhaseProgress로 보간한다. */
export function trainingProgress(job: JobSummary, nowMs: number | null): number {
    if (job.type !== 'train') return phaseProgress(job)
    if (job.status === 'provisioning' || job.status === 'queued') return 0
    if (job.status === 'finalizing' || job.status === 'done') return 1
    return nowMs === null ? (job.phase_progress ?? 0) : livePhaseProgress(job, nowMs)
}

/** 실제 추론은 완료 시점이 없어(무기한 실행) 처리량 곡선에 job 전체 진행률을 못 쓴다.
 *  짧은 웜업 구간(실제 서빙이 초반에 안정화되는 것과 같은 모양)만 갖고, 그 이후로는
 *  목표치에서 그대로 유지된다 (liveMetricSeries에서 사용). */
const INFER_WARMUP_SEC = 20

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

/** liveMetricSeries/currentLiveValue가 공유하는 한 시점의 값 계산 (웜업 곡선 + 웜업
 *  끝난 뒤의 지터). target/startedMs는 호출부에서 이미 null 체크를 끝낸 뒤 넘긴다. */
function liveValueAt(metric: JobMetricProfileItem, jobId: number, startedMs: number, target: number, atMs: number): number {
    const elapsedSec = (atMs - startedMs) / 1000
    const warmup = Math.max(0, Math.min(1, elapsedSec / INFER_WARMUP_SEC))
    const base = metricCurrentValue(metric, warmup) ?? target
    const jitter = warmup >= 1 ? pseudoJitter(jobId, atMs / 1000) * INFER_JITTER_FRAC * target : 0
    return Math.max(0, base + jitter)
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
        return liveValueAt(metric, job.id, startedMs, target, atMs)
    })
}

/** liveMetricSeries와 같은 웜업+지터 공식으로 "지금 이 순간" 값 하나만 계산한다.
 *  스케줄러 타임라인의 "요청 도착" 애니메이션 속도(처리량 req/s 기반)처럼, 그래프 전체가
 *  아니라 현재값 하나만 필요할 때 쓴다. */
export function currentLiveValue(metric: JobMetricProfileItem, job: JobSummary, nowMs: number): number {
    const target = metric.target_value === null ? null : Number(metric.target_value)
    if (target === null || !job.started_at) return 0

    const startedMs = new Date(job.started_at).getTime()
    const endMs = job.finished_at ? new Date(job.finished_at).getTime() : nowMs
    return liveValueAt(metric, job.id, startedMs, target, endMs)
}