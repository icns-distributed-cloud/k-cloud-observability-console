"use client";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

/** 스크러버가 훑을 수 있는 과거 범위 (초) */
export const TIMELINE_SPAN_SEC = 3600; // 1시간

interface TimeContextValue {
  /** 화면이 표시할 기준 시각 (Unix epoch 초). SSR 중에는 null */
  nowSec: number | null;
  /** 라이브 모드 여부 */
  isLive: boolean;
  /** 현재로부터 몇 초 전을 보고 있는지 (0 = 현재) */
  offsetSec: number;
  setOffsetSec: (v: number) => void;
  goLive: () => void;
}

const TimeContext = createContext<TimeContextValue | null>(null);

export function TimeProvider({ children }: { children: ReactNode }) {
  const [realNowMs, setRealNowMs] = useState<number | null>(null);
  const [offsetSec, setOffsetSecState] = useState(0);
  const [isLive, setIsLive] = useState(true);

  // 실제 현재 시각을 주기적으로 갱신
  useEffect(() => {
    setRealNowMs(Date.now());
    const id = setInterval(() => setRealNowMs(Date.now()), 2000);
    return () => clearInterval(id);
  }, []);

  const setOffsetSec = (v: number) => {
    setOffsetSecState(v);
    setIsLive(v === 0);
  };

  const goLive = () => {
    setOffsetSecState(0);
    setIsLive(true);
  };

  const nowSec = realNowMs === null ? null : realNowMs / 1000 - offsetSec;

  return (
    <TimeContext.Provider value={{ nowSec, isLive, offsetSec, setOffsetSec, goLive }}>
      {children}
    </TimeContext.Provider>
  );
}

export function useTime(): TimeContextValue {
  const ctx = useContext(TimeContext);
  if (!ctx) throw new Error("useTime must be used within TimeProvider");
  return ctx;
}