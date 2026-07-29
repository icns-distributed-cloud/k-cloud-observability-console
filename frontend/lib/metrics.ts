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

/**
 * 시각 t를 시드로 하는 결정론적 의사난수 (-1 ~ 1).
 * Math.random()과 달리 같은 t면 항상 같은 값이라
 * 라이브 갱신이나 타임라인 스크러버에서도 그래프가 안정적이다.
 */
function noise(t: number, seed: number): number {
  const x = Math.sin(t * 12.9898 + seed * 78.233) * 43758.5453
  return (x - Math.floor(x)) * 2 - 1
}

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

    const wave = Math.sin((2 * Math.PI * t) / period)
    // 진폭의 25% 정도를 불규칙 성분으로 섞어 실제 모니터링처럼 보이게 한다
    const jitter = noise(t, seedFrom(profile.metric_type)) * 0.15

    return baseline + amplitude * (wave + jitter)
  })
}

/** metric_type 문자열을 숫자 시드로 변환 (지표마다 다른 노이즈 패턴) */
function seedFrom(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 1000
  return h
}
