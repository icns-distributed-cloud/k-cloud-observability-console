'use client';

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { fetchJobs } from "@/lib/api";

type AlertKind = "warning" | "error";

interface SlaAlertItem {
  id: number;
  kind: AlertKind;
  jobId: number;
  modelName: string;
  typeLabel: string;
  /** warning 전용 */
  delaySec?: number;
  /** error 전용 */
  reason?: string;
  time: string;
}

const TYPE_LABELS: Record<string, string> = {
  train: "학습",
  infer: "추론",
};

const ERROR_REASONS = ["노드 연결 끊김", "GPU 메모리 부족(OOM)", "가속기 하드웨어 오류", "예기치 않은 프로세스 종료"];

const KIND_STYLE: Record<AlertKind, { color: string; title: string }> = {
  warning: { color: "var(--alert-warning)", title: "SLA 기준 초과" },
  error: { color: "var(--alert-critical)", title: "작업 실행 오류" },
};


export default function SlaAlert() {
  const pathname = usePathname();
  const [alerts, setAlerts] = useState<SlaAlertItem[]>([]);

  const isCsc = pathname?.startsWith("/csc") ?? false;

  useEffect(() => {
    if (isCsc) return;

    // 10초마다 지금 실행 중인 job 하나를 골라 경고 또는 오류 알림을 띄운다
    const interval = setInterval(() => {
      fetchJobs({ status: "running" })
        .then((jobs) => {
          if (jobs.length === 0) return;
          const job = jobs[Math.floor(Math.random() * jobs.length)];
          const kind: AlertKind = Math.random() < 0.25 ? "error" : "warning";
          const id = Date.now();

          const newAlert: SlaAlertItem = {
            id,
            kind,
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

          setAlerts((prev) => [...prev, newAlert]);

          setTimeout(() => {
            setAlerts((prev) => prev.filter((item) => item.id !== id));
          }, 5000);
        })
        .catch(() => {});
    }, 10000);

    return () => clearInterval(interval);
  }, [isCsc]);

  if (isCsc) return null;

  const removeAlert = (id: number) => {
    setAlerts((prev) => prev.filter((item) => item.id !== id));
  };

  return (
    <div
      style={{
        position: "fixed",
        bottom: "24px",
        right: "24px",
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        maxWidth: "380px",
        width: "100%",
      }}
    >
      {alerts.map((alert) => {
        const { color, title } = KIND_STYLE[alert.kind];
        return (
          <div
            key={alert.id}
            style={{
              position: "relative",
              padding: "16px 40px 16px 16px",
              backgroundColor: "var(--panel)",
              color: "var(--ink)",
              borderLeft: `5px solid ${color}`,
              border: "1px solid var(--line)",
              borderRadius: "8px",
              boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1)",
              display: "flex",
              flexDirection: "column",
              gap: "4px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span
                style={{
                  color,
                  fontWeight: "bold",
                  fontSize: "15px",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                {title}
              </span>
              <span style={{ fontSize: "12px", color: "var(--sub)" }}>{alert.time}</span>
            </div>

            <div style={{ fontSize: "14px", fontWeight: "normal", lineHeight: "1.4" }}>
              {alert.typeLabel} 작업{" "}
              <strong style={{ color: "var(--accent)" }}>
                J-{alert.jobId} ({alert.modelName})
              </strong>
              {alert.kind === "warning" ? (
                <>
                  의 처리가 SLA 기준보다
                  <span style={{ color, fontWeight: "bold" }}> {alert.delaySec}초</span> 지연되고 있습니다.
                </>
              ) : (
                <>
                  가 <span style={{ color, fontWeight: "bold" }}>{alert.reason}</span>(으)로 예기치 않게
                  종료되었습니다.
                </>
              )}
            </div>

            <button
              onClick={() => removeAlert(alert.id)}
              style={{
                position: "absolute",
                top: "12px",
                right: "12px",
                background: "none",
                border: "none",
                fontSize: "16px",
                cursor: "pointer",
                color: "var(--sub)",
              }}
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}
