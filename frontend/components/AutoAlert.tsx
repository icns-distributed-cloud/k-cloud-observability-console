'use client';

import { useAlerts } from "@/lib/AlertContext";
import { alertColor, alertTitle, AlertBody } from "@/components/AlertMessage";

export default function AutoAlert() {
  const { toasts, dismissToast } = useAlerts();

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
      {toasts.map((alert) => {
        const color = alertColor(alert);
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
                {alertTitle(alert)}
              </span>
              <span style={{ fontSize: "12px", color: "var(--sub)" }}>{alert.time}</span>
            </div>

            <div style={{ fontSize: "14px", fontWeight: "normal", lineHeight: "1.4" }}>
              <AlertBody alert={alert} color={color} />
            </div>

            <button
              onClick={() => dismissToast(alert.id)}
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
