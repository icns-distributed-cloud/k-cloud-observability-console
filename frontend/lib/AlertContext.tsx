"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { fetchJobs } from "@/lib/api";

export type AlertKind = "warning" | "error";

export interface AlertItem {
  id: number;
  kind: AlertKind;
  jobId: number;
  modelName: string;
  typeLabel: string;
  /** warning 전용 */
  delaySec?: number;
  /** error 전용 - "에러이름"으로도 쓴다(ERROR: {reason}) */
  reason?: string;
  time: string;
  read: boolean;
}

interface AlertContextValue {
  /** 우하단에 잠깐 떴다 사라지는 토스트 */
  toasts: AlertItem[];
  /** 종 아이콘 드롭다운에 쌓이는 이력 - 최근 HISTORY_CAP개, 안 사라짐 */
  history: AlertItem[];
  unreadCount: number;
  dismissToast: (id: number) => void;
  markAllRead: () => void;
}

const AlertContext = createContext<AlertContextValue | null>(null);

const TYPE_LABELS: Record<string, string> = { train: "학습", infer: "추론" };

/** error(빨강)는 "의도 없이 죽는" 경우를 나타낸다 - 종료 버튼(POST /jobs/{id}/terminate)은
 *  사용자가 의도한 종료라 여기 해당하지 않고, 애초에 이 서비스엔 job이 의도치 않게
 *  죽는 실제 이벤트가 없다. 그래서 warning과 마찬가지로 연출용 시뮬레이션이다. */
const ERROR_REASONS = ["노드 연결 끊김", "GPU 메모리 부족(OOM)", "가속기 하드웨어 오류", "예기치 않은 프로세스 종료"];
const HISTORY_CAP = 30;

/** 매번 25% 확률로 뽑으면(예전 방식) 평균은 4개 중 1개여도 우연히 연달아 몇 번씩
 *  안 나오거나 몰아서 나올 수 있다. 대신 [error, warning, warning, warning]을 섞은
 *  묶음을 순서대로 소비하고, 다 쓰면 새로 섞은 묶음을 다시 채운다 - "4번 중 정확히
 *  1번은 error, 순서는 매번 다르게"가 보장된다. */
function shuffledKindBatch(): AlertKind[] {
  const batch: AlertKind[] = ["error", "warning", "warning", "warning"];
  for (let i = batch.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [batch[i], batch[j]] = [batch[j], batch[i]];
  }
  return batch;
}

/** SLA 위반 경고/작업 실행 오류 알림을 만들고 보관한다 - 토스트(AutoAlert)와 종
 *  아이콘 드롭다운(AlertBell) 둘 다 이 컨텍스트 하나를 구독한다. DB 테이블은 안 둔다 -
 *  애초에 진짜 SLA 계산이나 job 장애 감지 로직이 없는 순수 연출용 데이터라(둘 다
 *  fetchJobs로 고른 실행 중인 job 위에 무작위로 얹는 것뿐), 서버에 영속시켜야 할
 *  "진짜" 이벤트가 아니다 - 새로고침하면 이력이 비워지는 것도 자연스럽다. */
export function AlertProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isCsc = pathname?.startsWith("/csc") ?? false;
  const [toasts, setToasts] = useState<AlertItem[]>([]);
  const [history, setHistory] = useState<AlertItem[]>([]);
  const kindQueueRef = useRef<AlertKind[]>([]);

  useEffect(() => {
    if (isCsc) return;

    const interval = setInterval(() => {
      fetchJobs({ status: "running" })
        .then((jobs) => {
          if (jobs.length === 0) return;
          const job = jobs[Math.floor(Math.random() * jobs.length)];
          if (kindQueueRef.current.length === 0) kindQueueRef.current = shuffledKindBatch();
          const kind = kindQueueRef.current.shift()!;
          const id = Date.now();

          const newAlert: AlertItem = {
            id,
            kind,
            read: false,
            jobId: job.id,
            modelName: job.model_name,
            typeLabel: TYPE_LABELS[job.type] ?? job.type,
            delaySec: kind === "warning" ? Math.floor(3 + Math.random() * 12) : undefined,
            reason: kind === "error" ? ERROR_REASONS[Math.floor(Math.random() * ERROR_REASONS.length)] : undefined,
            time: new Date().toLocaleTimeString("ko-KR", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            }),
          };

          setToasts((prev) => [...prev, newAlert]);
          setHistory((prev) => [newAlert, ...prev].slice(0, HISTORY_CAP));

          setTimeout(() => {
            setToasts((prev) => prev.filter((a) => a.id !== id));
          }, 5000);
        })
        .catch(() => {});
    }, 10000);

    return () => clearInterval(interval);
  }, [isCsc]);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const markAllRead = useCallback(() => {
    setHistory((prev) => (prev.some((a) => !a.read) ? prev.map((a) => ({ ...a, read: true })) : prev));
  }, []);

  const unreadCount = history.filter((a) => !a.read).length;

  return (
    <AlertContext.Provider value={{ toasts, history, unreadCount, dismissToast, markAllRead }}>
      {children}
    </AlertContext.Provider>
  );
}

export function useAlerts(): AlertContextValue {
  const ctx = useContext(AlertContext);
  if (!ctx) throw new Error("useAlerts must be used within AlertProvider");
  return ctx;
}
