"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

interface TimeContextValue {
  /** 화면이 표시할 기준 시각 (Unix epoch 초). SSR 중에는 null */
  nowSec: number | null;
}

const TimeContext = createContext<TimeContextValue | null>(null);

export function TimeProvider({ children }: { children: ReactNode }) {
  const [nowMs, setNowMs] = useState<number | null>(null);

  useEffect(() => {
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 2000);
    return () => clearInterval(id);
  }, []);

  const nowSec = nowMs === null ? null : nowMs / 1000;

  return <TimeContext.Provider value={{ nowSec }}>{children}</TimeContext.Provider>;
}

export function useTime(): TimeContextValue {
  const ctx = useContext(TimeContext);
  if (!ctx) throw new Error("useTime must be used within TimeProvider");
  return ctx;
}