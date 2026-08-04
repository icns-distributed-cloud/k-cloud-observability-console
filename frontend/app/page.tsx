"use client";
import { useRouter } from "next/navigation";

export default function LandingPage() {
  const router = useRouter();

  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "calc(100vh - 200px)",
        gap: 32,
        padding: "24px 28px",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.01em" }}>
          K-Cloud Observability Console
        </div>
        <div style={{ fontSize: 17, color: "var(--sub)", marginTop: 8 }}>
          AI 반도체 클라우드 플랫폼 · 경희대 ICNS
        </div>
      </div>

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", justifyContent: "center" }}>
        <RoleCard
          role="CSC"
          title="클라우드 서비스 소비자"
          desc="작업을 제출하고 내 작업의 진행 상황을 확인합니다"
          onClick={() => router.push("/csc/jobs")}
        />
        <RoleCard
          role="CSP"
          title="클라우드 서비스 제공자"
          desc="클러스터·노드 자원과 전체 작업 스케줄을 관제합니다"
          onClick={() => router.push("/csp")}
        />
      </div>
    </main>
  );
}

function RoleCard({
  role,
  title,
  desc,
  onClick,
}: {
  role: string;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: 320,
        textAlign: "left",
        background: "var(--panel)",
        border: "1px solid var(--line)",
        borderRadius: 16,
        padding: "24px 26px",
        cursor: "pointer",
        fontFamily: "inherit",
        color: "var(--ink)",
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: "0.08em",
          color: "var(--accent)",
          fontFamily: "'IBM Plex Mono', monospace",
          marginBottom: 10,
        }}
      >
        {role}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 15, color: "var(--sub)", lineHeight: 1.6 }}>{desc}</div>
    </button>
  );
}