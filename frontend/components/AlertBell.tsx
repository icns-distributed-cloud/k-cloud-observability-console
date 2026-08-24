"use client";
import { useEffect, useRef, useState } from "react";
import { useAlerts } from "@/lib/AlertContext";
import { alertColor, alertTitle, AlertBody } from "@/components/AlertMessage";

/** 상단 바 우측의 종 아이콘 - 눌러서 최근 알림 이력(AlertContext.history)을 드롭다운으로
 *  본다. 열 때 전부 읽음 처리한다(흔한 알림벨 UX). */
export default function AlertBell() {
  const { history, unreadCount, markAllRead } = useAlerts();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const toggle = () => {
    // setOpen의 updater 함수 안에서 markAllRead(다른 컴포넌트=AlertProvider의
    // setHistory)를 부르면 안 된다 - updater는 렌더 단계에서도 다시 호출될 수 있어서
    // "다른 컴포넌트를 렌더 중에 업데이트했다"는 React 경고/에러가 난다. 이벤트
    // 핸들러 본문에서 순서대로 부르면 둘 다 그냥 일반적인 상태 업데이트다.
    const next = !open;
    setOpen(next);
    if (next) markAllRead();
  };

  return (
    <div ref={wrapRef} style={{ position: "relative", marginLeft: "auto" }}>
      <button
        onClick={toggle}
        aria-label="알림"
        style={{
          position: "relative",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 6,
          display: "flex",
        }}
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span
            style={{
              position: "absolute",
              top: 2,
              right: 2,
              minWidth: 16,
              height: 16,
              padding: "0 3px",
              borderRadius: 8,
              background: "var(--alert-critical)",
              color: "#FFFFFF",
              fontSize: 10,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              lineHeight: 1,
            }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            width: 360,
            maxHeight: 420,
            overflowY: "auto",
            background: "var(--panel)",
            border: "1px solid var(--line)",
            borderRadius: 10,
            boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.15)",
            zIndex: 10000,
          }}
        >
          <div
            style={{
              padding: "10px 14px",
              borderBottom: "1px solid var(--line)",
              fontWeight: 700,
              fontSize: 13,
              position: "sticky",
              top: 0,
              background: "var(--panel)",
            }}
          >
            알림
          </div>
          {history.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", fontSize: 12.5, color: "var(--sub)" }}>
              알림이 없습니다.
            </div>
          ) : (
            history.map((alert) => {
              const color = alertColor(alert);
              return (
                <div key={alert.id} style={{ padding: "10px 14px", borderBottom: "1px solid var(--line)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                    <span style={{ color, fontWeight: 700, fontSize: 12.5 }}>{alertTitle(alert)}</span>
                    <span style={{ fontSize: 11, color: "var(--sub)", flexShrink: 0 }}>{alert.time}</span>
                  </div>
                  <div style={{ fontSize: 12.5, lineHeight: 1.4 }}>
                    <AlertBody alert={alert} color={color} />
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

function BellIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 20 20" fill="none">
      <path
        d="M10 2.5a5 5 0 0 0-5 5v3.1c0 .5-.17.98-.48 1.37L3 14h14l-1.52-2.03a2.3 2.3 0 0 1-.48-1.37V7.5a5 5 0 0 0-5-5Z"
        stroke="var(--ink)"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M8 17a2 2 0 0 0 4 0" stroke="var(--ink)" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
