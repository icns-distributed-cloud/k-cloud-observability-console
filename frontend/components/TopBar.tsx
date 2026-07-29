"use client";
import { useRouter } from "next/navigation";

export default function TopBar() {
  const router = useRouter();

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "12px 28px",
        borderBottom: "1px solid var(--line)",
        background: "var(--panel)",
      }}
    >
      <div
        onClick={() => router.push("/")}
        style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
      >
        <span
          style={{
            width: 18,
            height: 18,
            borderRadius: 5,
            background: "var(--accent)",
            flexShrink: 0,
          }}
        />
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: "-0.01em" }}>
            K-Cloud 연구 클러스터
          </div>
          <div
            style={{
              fontSize: 10,
              color: "var(--sub)",
              fontFamily: "'IBM Plex Mono', monospace",
              letterSpacing: "0.04em",
            }}
          >
            경희대 ICNS
          </div>
        </div>
      </div>
    </header>
  );
}