export interface DominanceBand {
  dominant: 'a' | 'b'
  label: string
  startFrac: number // 0-1, 시리즈 인덱스 범위 상의 위치
  endFrac: number
}

interface RawSegment {
  startIdx: number
  endIdx: number
  dominant: 'a' | 'b'
}

/**
 * 두 시계열을 "이 시점엔 어느 쪽이 더 큰가"로 run-length encode해서 라벨 붙은
 * 구간을 만든다. Prefill/Decode 백로그가 서로 다른 순간에 우세해지는 구간을
 * D1/D2.../Prefill A/Prefill B처럼 순서대로 이름 붙이는 데 쓴다 - 새 백엔드
 * 데이터 없이 이미 generateMetricSeries로 만든 두 배열만으로 결정론적으로 계산된다.
 *
 * 주의: 이 함수는 라벨 구간만 계산한다 - 두 시리즈 자체는 모든 구간에서 항상 같이
 * 그려진다(로컬 스케줄링 탭 설계 시 확정: 한쪽만 보이는 렌더링 모드는 없음).
 * "우세"는 상대적으로 어느 쪽이 더 큰지일 뿐, 작은 쪽이 0이 되거나 사라진다는
 * 뜻이 아니다.
 */
export function computeDominanceBands(
  seriesA: number[],
  seriesB: number[],
  labelA: (n: number) => string,
  labelB: (n: number) => string,
  minFrac = 0.04
): DominanceBand[] {
  const n = Math.min(seriesA.length, seriesB.length)
  if (n < 2) return []

  // 1. 지점별 우세 쪽
  const dominance: ('a' | 'b')[] = Array.from({ length: n }, (_, i) =>
    seriesA[i] >= seriesB[i] ? 'a' : 'b'
  )

  // 2. run-length encode
  let raw: RawSegment[] = []
  let segStart = 0
  for (let i = 1; i <= n; i++) {
    if (i === n || dominance[i] !== dominance[segStart]) {
      raw.push({ startIdx: segStart, endIdx: i - 1, dominant: dominance[segStart] })
      segStart = i
    }
  }

  // 3. 잔구간(길이 비율 < minFrac) 병합 - 앞 구간에 흡수, 첫 구간이면 다음 구간에 흡수.
  //    색칠 영역 자체는 그대로 남으므로 데이터가 사라지진 않고 라벨만 안 겹치게 된다.
  const totalSpan = n - 1
  const merged: RawSegment[] = []
  for (const seg of raw) {
    const frac = (seg.endIdx - seg.startIdx) / totalSpan
    if (frac < minFrac && merged.length > 0) {
      merged[merged.length - 1].endIdx = seg.endIdx
    } else if (frac < minFrac && merged.length === 0 && raw.length > 1) {
      // 첫 구간이 잔구간이면 다음 구간과 합치기 위해 일단 push해두고 아래에서 재정리
      merged.push(seg)
    } else {
      merged.push(seg)
    }
  }

  // 4. 병합 후 인접한 같은-dominant 구간을 다시 합친다 (2차 RLE)
  const collapsed: RawSegment[] = []
  for (const seg of merged) {
    const last = collapsed[collapsed.length - 1]
    if (last && last.dominant === seg.dominant) {
      last.endIdx = seg.endIdx
    } else {
      collapsed.push({ ...seg })
    }
  }

  // 5. 등장 순서대로 dominant별 카운터를 매겨 라벨링
  let countA = 0
  let countB = 0
  return collapsed.map((seg) => {
    const label =
      seg.dominant === 'a' ? labelA(++countA) : labelB(++countB)
    return {
      dominant: seg.dominant,
      label,
      startFrac: seg.startIdx / totalSpan,
      endFrac: seg.endIdx / totalSpan,
    }
  })
}

/** 타임라인 하단 공용 시간축 눈금. lib/timeline.ts의 formatTick과 같은 포맷(HH:mm)을
 *  쓰지만, 이 탭의 최소 구간이 10분이라 초 단위는 안 쓴다(withSeconds=false 고정). */
export function buildTimeAxisTicks(
  fromSec: number,
  toSec: number,
  formatTickFn: (ms: number) => string,
  count = 6
): { pos: number; label: string }[] {
  if (count < 2) return []
  return Array.from({ length: count }, (_, i) => {
    const pos = i / (count - 1)
    const ms = (fromSec + (toSec - fromSec) * pos) * 1000
    return { pos, label: formatTickFn(ms) }
  })
}
