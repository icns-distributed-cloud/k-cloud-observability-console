import type { MetricProfilePoint } from '@/app/types'

/**
 * 파형 프로파일로부터 시계열 값을 생성한다.
 * 백엔드는 실측 시계열을 주지 않고 baseline/amplitude/period_sec만 주므로
 * 프론트에서 사인파로 값을 만들어 차트에 표시한다.
 *
 * @param profile 파형 파라미터
 * @param toSec   구간 끝 시각 (Unix epoch 초)
 * @param spanSec 구간 길이 (초). 기본 5분
 * @param points  생성할 데이터 포인트 개수
 */
export function generateMetricSeries(
  profile: MetricProfilePoint,
  toSec: number,
  spanSec = 300,
  points = 30
): number[] {
  const baseline = Number(profile.baseline)
  const amplitude = Number(profile.amplitude)
  const period = profile.period_sec

  const fromSec = toSec - spanSec
  const step = points > 1 ? spanSec / (points - 1) : 0

  return Array.from({ length: points }, (_, i) => {
    const t = fromSec + step * i

    // period가 0이면 진동 없이 baseline 유지 (0으로 나누기 방지)
    if (!period) return baseline

    return baseline + amplitude * Math.sin((2 * Math.PI * t) / period)
  })
}

/** 백엔드가 0~1 비율로 주는 지표들. 그 외는 실제 단위 값 그대로 */
const RATIO_METRICS = new Set(['utilization', 'util', 'mem', 'cpu'])

export function generateDisplaySeries(
  profile: MetricProfilePoint,
  toSec: number,
  spanSec = 300,
  points = 30
): number[] {
  const series = generateMetricSeries(profile, toSec, spanSec, points)
  const factor = RATIO_METRICS.has(profile.metric_type) ? 100 : 1
  return series.map((v) => v * factor)
}