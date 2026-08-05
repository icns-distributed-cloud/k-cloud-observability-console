"use client";
import { useRouter, usePathname } from "next/navigation";

export default function TopBar() {
  const router = useRouter();
  const pathname = usePathname();

  // 랜딩(역할 선택) 화면에서는 상단 바를 숨긴다
  if (pathname === "/") return null;

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
        onClick={() => router.push("/csp")}
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
          <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: "-0.01em" }}>
            K-Cloud 연구 클러스터
          </div>
          <div
            style={{
              fontSize: 14,
              color: "var(--sub)",
              fontFamily: "'IBM Plex Mono', monospace",
              letterSpacing: "0.04em",
            }}
          >
            경희대 ICNS
          </div>
        </div>
      </div>

      <nav style={{ display: "flex", gap: 4, marginLeft: 8 }}>
        <NavLink label="지도" href="/csp" active={pathname === "/csp"} onClick={router.push} />
        <NavLink
          label="클러스터 현황"
          href="/csp/infra"
          active={pathname.startsWith("/csp/infra")}
          onClick={router.push}
        />
        <NavLink
          label="작업 목록"
          href="/csp/jobs"
          active={pathname.startsWith("/csp/jobs")}
          onClick={router.push}
        />
        <NavLink
          label="스케줄러"
          href="/csp/timeline"
          active={pathname.startsWith("/csp/timeline")}
          onClick={router.push}
        />
      </nav>
    </header>
  );
}

function NavLink({
  label,
  href,
  active,
  onClick,
}: {
  label: string;
  href: string;
  active: boolean;
  onClick: (href: string) => void;
}) {
  return (
    <button
      onClick={() => onClick(href)}
      style={{
        background: active ? "var(--panel-2)" : "transparent",
        border: "none",
        borderRadius: 8,
        padding: "6px 12px",
        cursor: "pointer",
        fontFamily: "inherit",
        fontSize: 17,
        fontWeight: 700,
        color: active ? "var(--ink)" : "var(--sub)",
      }}
    >
      {label}
    </button>
  );
}