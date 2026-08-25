/** trough_mb~peak_mb 사이를 오르내리는 사다리꼴 모양의 "돔" 몇 개를 이어붙인
 *  Allocated 트레이스. PyTorch Profiler의 Memory View를 참고한 것 - 실제 학습
 *  스텝 하나가 (idle 대기 → forward로 활성화 채우며 상승 → backward 동안 정점
 *  부근에서 출렁 → optimizer step에서 뚝 떨어짐 → 다음 스텝까지 idle) 순서를
 *  밟는 걸 흉내낸다. 실제 실행 로그가 아니라 모델 구조(peak/trough/reserved)만
 *  으로 뽑은 예측치라, 시간(now)과 무관하게 model_id로 시드된 결정론적 값 하나를
 *  계산해서 항상 같은 모양을 그린다(다른 그래프들처럼 실시간으로 흘러가는 게 아님).
 *
 *  한 주기(cycle, 전체 길이의 1/DOMES) 안에서:
 *   0~28%   trough 평평 (idle)
 *   28~40%  trough→peak 상승(smoothstep)
 *   40~62%  peak 부근 평평 + 촘촘한 잔진동(backward)
 *   62~74%  peak→trough 하강(smoothstep)
 *   74~100% trough 평평 (다음 주기 idle로 그대로 이어짐)
 *  노이즈는 정점 구간에서만(고르게 있는 게 아니라) 진폭 큰 고주파로 섞어서,
 *  실제 프로파일러 그래프처럼 정점만 "지글거리고" 나머지는 깨끗하게 유지한다. */
const DOMES = 3.5
const TROUGH_END = 0.28
const RISE_END = 0.4
const PEAK_END = 0.62
const FALL_END = 0.74
const NOISE_FRAC = 0.045

function smoothstep(t: number): number {
  const c = Math.max(0, Math.min(1, t))
  return c * c * (3 - 2 * c)
}

/** 부드럽게 보간되는 값 노이즈가 아니라, 표본 하나하나가 서로 무관하게 튀는
 *  거친 노이즈 - 실제 프로파일러의 정점 부근 "지글거림"에 더 가깝다. */
function jaggedNoise(seed: number, i: number): number {
  const x = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453
  return (x - Math.floor(x)) * 2 - 1
}

function domeShape(cycleFrac: number): number {
  if (cycleFrac < TROUGH_END) return 0
  if (cycleFrac < RISE_END) return smoothstep((cycleFrac - TROUGH_END) / (RISE_END - TROUGH_END))
  if (cycleFrac < PEAK_END) return 1
  if (cycleFrac < FALL_END) return 1 - smoothstep((cycleFrac - PEAK_END) / (FALL_END - PEAK_END))
  return 0
}

export function generateAllocatedTrace(
  peakMb: number,
  troughMb: number,
  seed: number,
  points = 150
): number[] {
  const span = peakMb - troughMb
  return Array.from({ length: points }, (_, i) => {
    const f = points > 1 ? i / (points - 1) : 0
    const cycleFrac = (f * DOMES) % 1
    const shape = domeShape(cycleFrac)
    // shape가 1에 가까운(정점) 구간에서만 노이즈가 실리게 exponent를 높여
    // 급격히 깎는다 - 어깨(rise/fall) 구간은 거의 깨끗하게 남는다.
    const noiseWeight = shape ** 6
    const noise = jaggedNoise(seed, i) * NOISE_FRAC * noiseWeight
    return Math.max(0, troughMb + span * shape + span * noise)
  })
}

/** min~max를 덮는 "예쁜" 눈금 count개 (예: 0/200/400/600/800/1000/1200) -
 *  MetricChart.tsx의 niceTicks와 같은 알고리즘. */
export function niceTicks(min: number, max: number, count = 7): number[] {
  const raw = (max - min) / (count - 1) || Math.abs(max) / 10 || 1
  const mag = 10 ** Math.floor(Math.log10(raw))
  for (const m of [1, 2, 2.5, 5, 10, 20]) {
    const step = m * mag
    const lo = Math.floor(min / step) * step
    if (step >= raw && lo + (count - 1) * step >= max) {
      return Array.from({ length: count }, (_, i) => lo + i * step)
    }
  }
  return [min, max]
}

/** MB를 사람이 읽기 좋은 단위로 - 1024 이상이면 GB */
export function formatMb(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)}GB`
  return `${Math.round(mb)}MB`
}
