'use client'
import { useEffect, useState } from 'react'

/**
 * 현재 시각(ms)을 주기적으로 갱신하는 훅.
 * 서버 렌더링 시에는 null을 반환해 hydration 불일치를 피한다.
 *
 * @param intervalMs 갱신 주기. 0이면 최초 1회만 설정
 */
export function useNow(intervalMs = 2000): number | null {
  const [now, setNow] = useState<number | null>(null)

  useEffect(() => {
    setNow(Date.now())
    if (intervalMs <= 0) return

    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])

  return now
}