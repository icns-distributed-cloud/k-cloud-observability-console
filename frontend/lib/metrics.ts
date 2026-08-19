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
 * 시각 t를 시드로 하는 결정론적 "흔들림" (-1 ~ 1 남짓). 서로 다른 주파수의 사인파
 * 세 개를 섞어서, 매 샘플이 이전 샘플과 무관하게 튀는 진짜 노이즈가 아니라 실제
 * 모니터링 그래프처럼 부드럽게 오르내리는 굴곡을 만든다. 추론 상세 페이지의
 * 처리량 그래프(liveMetricSeries)에 쓰던 것과 같은 함수 - 클러스터 지표 그래프도
 * 여기서 쓰려고 공용으로 옮겼다. Math.random()과 달리 같은 (seed, t)면 항상 같은
 * 값이라 폴링·리렌더 사이에도 이미 지나간 구간이 안정적으로 유지된다.
 */
export function pseudoJitter(seed: number, t: number): number {
  return (
    Math.sin(t * 0.31 + seed) * 0.5 +
    Math.sin(t * 0.7 + seed * 2.7) * 0.3 +
    Math.sin(t * 1.9 + seed * 5.3) * 0.2
  )
}

/** 정수 격자점 n에서의 결정론적 의사난수 [0, 1). */
function hash1D(n: number): number {
  const x = Math.sin(n * 127.1) * 43758.5453
  return x - Math.floor(x)
}

/** 격자점 사이를 부드럽게(smoothstep) 보간한 1차원 값 노이즈 [-1, 1].
 *  Math.sin(t)와 달리 "일정 주기로 정확히 반복되는 혹 모양"이 없다 - 이웃한 두
 *  격자점의 무작위 값을 보간할 뿐이라, 흘러가면서 봉우리 높이도 간격도 매번 달라진다. */
function valueNoise1D(t: number, seed: number): number {
  const i = Math.floor(t)
  const f = t - i
  const a = hash1D(i + seed * 131.71)
  const b = hash1D(i + 1 + seed * 131.71)
  const u = f * f * (3 - 2 * f)
  return (a + (b - a) * u) * 2 - 1
}

/** valueNoise1D를 옥타브 여러 겹(주파수를 매번 정수배가 아닌 비율로 올려가며) 합친
 *  fractal 노이즈. 사인파 기반 pseudoJitter는 성분들의 주기가 고정이라 결국 어떤
 *  조합이든 유한한 구간 안에서 패턴이 다시 보이지만, 이건 격자 자체가 유사난수라
 *  "같은 모양이 반복된다"는 인상이 없다 - 실제 CPU/전력/지연시간 모니터링 그래프에
 *  훨씬 가깝다. */
function fractalNoise(t: number, seed: number, octaves = 4): number {
  let value = 0
  let amp = 0.5
  let freq = 1
  let ampSum = 0
  for (let o = 0; o < octaves; o++) {
    value += amp * valueNoise1D(t * freq, seed + o * 17.7)
    ampSum += amp
    amp *= 0.5
    freq *= 2.13 // 정수배면 옥타브끼리 맞물려 도로 주기처럼 보인다
  }
  return value / ampSum
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
  const seed = seedFrom(profile.metric_type)

  return Array.from({ length: points }, (_, i) => {
    const t = fromSec + step * i

    // period가 0이면 진동 없이 baseline 유지 (0으로 나누기 방지)
    if (!period) return baseline

    // period_sec은 더 이상 "정확한 사인파 주기"가 아니라 "이 정도 시간에 굴곡 하나가
    // 지나간다"는 대략적인 스케일로만 쓴다 - 주기가 아니라서 실제로 반복되지 않는다.
    return baseline + amplitude * fractalNoise(t / (period / 3), seed)
  })
}

/** metric_type 문자열을 숫자 시드로 변환 (지표마다 다른 노이즈 패턴) */
function seedFrom(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 1000
  return h
}

/** SLO 위반 횟수처럼 "지금 이 순간의 값"이 아니라 시간이 지나며 쌓이는 카운터에 쓴다.
 *  baseline/amplitude/period로 사인파를 그리는 다른 지표와 달리, 이런 값은 오르내리면
 *  안 되고(위반이 "취소"되진 않으니) 정수여야 한다 - baseline을 "시간당 발생 횟수"로
 *  해석해서, 현재 시(hour)가 시작된 뒤 지난 시간만큼만 누적한다. 정시마다 0으로
 *  리셋되는 것도 실제 대시보드의 "이번 시간 위반 건수"와 같은 관례라 자연스럽다. */
export function cumulativeThisHour(ratePerHour: number, nowSec: number): number {
  const now = new Date(nowSec * 1000)
  const hourStart = new Date(now)
  hourStart.setMinutes(0, 0, 0)
  const hoursElapsed = (now.getTime() - hourStart.getTime()) / 3_600_000
  return Math.round(ratePerHour * hoursElapsed)
}

/** 여러 노드의 같은 metric_type 프로파일을 각자 시계열로 만든 뒤 지점별로 평균낸다.
 *  스케줄러 페이지에서 "학습 풀"/"추론 풀"처럼 노드 여러 개를 하나의 클러스터 지표로
 *  보여줘야 하는데, 라이브 클러스터가 하나뿐이라 클러스터 단위 프로파일로는 두 풀을
 *  구분할 수 없다 - 대신 노드별 프로파일(이미 존재)을 풀 범위로만 묶어 평균낸다. */
export function averageMetricSeries(
  profiles: MetricProfilePoint[],
  toSec: number,
  spanSec = 300,
  points = 30
): number[] {
  if (profiles.length === 0) return Array(points).fill(0)
  const seriesList = profiles.map((p) => generateMetricSeries(p, toSec, spanSec, points))
  return Array.from(
    { length: points },
    (_, i) => seriesList.reduce((sum, s) => sum + s[i], 0) / seriesList.length
  )
}
