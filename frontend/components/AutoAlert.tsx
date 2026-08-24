'use client';

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { fetchJobs } from "@/lib/api";

interface SlaAlertItem {
  id: number;
  jobId: number;
  modelName: string;
  typeLabel: string;
  delaySec: number;
  time: string;
}

const TYPE_LABELS: Record<string, string> = {
  train: "학습",
  infer: "추론",
};

export default function SlaAlert() {
  const pathname = usePathname();
  const [alerts, setAlerts] = useState<SlaAlertItem[]>([]);

  const isCsc = pathname?.startsWith("/csc") ?? false;

  useEffect(() => {
    if (isCsc) return;

    // 10초마다 지금 실행 중인 job 하나를 골라 SLA 지연 알림을 띄운다
    const interval = setInterval(() => {
      fetchJobs({ status: "running" })
        .then((jobs) => {
          if (jobs.length === 0) return;
          const job = jobs[Math.floor(Math.random() * jobs.length)];
          const id = Date.now();
          const delaySec = Math.floor(3 + Math.random() * 12);

          const newAlert: SlaAlertItem = {
            id,
            jobId: job.id,
            modelName: job.model_name,
            typeLabel: TYPE_LABELS[job.type] ?? job.type,
            delaySec,
            time: new Date().toLocaleTimeString("ko-KR", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            }),
          };

          setAlerts((prev) => [...prev, newAlert]);

          setTimeout(() => {
            setAlerts((prev) => prev.filter((item) => item.id !== id));
          }, 4000);
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
      {alerts.map((alert) => (
        <div
          key={alert.id}
          style={{
            position: "relative",
            padding: "16px 40px 16px 16px",
            backgroundColor: "var(--panel)",
            color: "var(--ink)",
            borderLeft: "5px solid var(--alert-critical)",
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
                color: "var(--alert-critical)",
                fontWeight: "bold",
                fontSize: "15px",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              SLA 기준 초과
            </span>
            <span style={{ fontSize: "12px", color: "var(--sub)" }}>{alert.time}</span>
          </div>

          <div style={{ fontSize: "14px", fontWeight: "normal", lineHeight: "1.4" }}>
            {alert.typeLabel} 작업{" "}
            <strong style={{ color: "var(--accent)" }}>
              J-{alert.jobId} ({alert.modelName})
            </strong>
            의 처리가 SLA 기준보다
            <span style={{ color: "var(--alert-critical)", fontWeight: "bold" }}> {alert.delaySec}초</span> 지연되고 있습니다.
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
      ))}
    </div>
  );
}
