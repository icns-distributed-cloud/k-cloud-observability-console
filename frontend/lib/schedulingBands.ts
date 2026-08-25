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
