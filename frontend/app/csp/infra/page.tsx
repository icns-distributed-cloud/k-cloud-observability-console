"use client";
import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Breadcrumb from "@/components/Breadcrumb";
import StatCard from "@/components/StatCard";
import { fetchProviders } from "@/lib/api";
import type { ProviderTree } from "@/app/types";
import styles from "./page.module.css";

const PROVIDER_KIND_LABELS: Record<string, string> = {
  onprem: "온프레미스",
  cloud: "클라우드",
};

const STATUS_LABELS: Record<string, string> = {
  active: "가동중",
  standby: "대기",
};

export default function InfraPage() {
  const router = useRouter();
  const [providers, setProviders] = useState<ProviderTree[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchProviders()
      .then(setProviders)
      .catch((e) => setError(String(e)));
  }, []);

  if (error) return <main style={{ padding: 24 }}>불러오기 실패: {error}</main>;

  const allClusters = providers.flatMap((p) => p.regions.flatMap((r) => r.clusters));
  const totalNodes = allClusters.reduce((n, c) => n + c.node_count, 0);
  const activeCount = allClusters.filter((c) => c.status === "active").length;
  const alertCount = allClusters.filter((c) => c.has_alert).length;

  return (
    <main style={{ padding: "24px 28px" }}>
      <Breadcrumb
        segments={[
          { label: "가용영역", onClick: () => router.push("/csp") },
          { label: "클러스터 현황" },
        ]}
      />

      <div style={{ margin: "16px 0 20px" }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>클러스터 현황</div>
        <div style={{ fontSize: 12.5, color: "var(--sub)", marginTop: 4 }}>
          프로바이더 {providers.length} · 클러스터 {allClusters.length} · 노드 {totalNodes}
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
        <StatCard label="전체 클러스터" value={allClusters.length} />
        <StatCard label="가동중" value={activeCount} />
        <StatCard label="전체 노드" value={totalNodes} />
        <StatCard label="알림" value={alertCount} unit="건" />
      </div>

      <div
        style={{
          background: "var(--panel)",
          border: "1px solid var(--line)",
          borderRadius: 14,
          overflow: "hidden",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead>
            <tr style={{ background: "var(--panel-2)" }}>
              <Th>프로바이더</Th>
              <Th>리전</Th>
              <Th>위치</Th>
              <Th>클러스터</Th>
              <Th align="right">노드</Th>
              <Th align="right">활용률</Th>
              <Th align="right">시간당 비용</Th>
              <Th align="center">상태</Th>
              <Th align="center">상세</Th>
            </tr>
          </thead>
          <tbody>
            {providers.flatMap((p) =>
              p.regions.flatMap((r) =>
                r.clusters.map((c) => (
                  <tr
                    key={c.id}
                    className={styles.row}
                    onClick={() => router.push(`/csp/clusters/${c.id}`)}
                    style={{ borderTop: "1px solid var(--line)", cursor: "pointer" }}
                  >
                    <Td>
                      {p.name}
                      <span style={{ color: "var(--sub)", fontSize: 11, marginLeft: 6 }}>
                        {PROVIDER_KIND_LABELS[p.kind] ?? p.kind}
                      </span>
                    </Td>
                    <Td>{r.name}</Td>
                    <Td muted>{r.location}</Td>
                    <Td>
                      <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                        <span
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: "50%",
                            background: c.status === "active" ? "var(--active)" : "var(--idle)",
                          }}
                        />
                        <span style={{ fontWeight: 600 }}>{c.name}</span>
                        {c.has_alert && (
                          <span
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: "50%",
                              background: "#EF4444",
                            }}
                          />
                        )}
                      </span>
                    </Td>
                    <Td align="right" mono>
                      {c.node_count}
                    </Td>
                    <Td align="right" mono>
                      {Math.round(c.avg_util)}%
                    </Td>
                    <Td align="right" mono muted>
                      {Number(c.cost_per_hour) === 0 ? "—" : `$${c.cost_per_hour}`}
                    </Td>
                    <Td align="center">
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: c.status === "active" ? "var(--active)" : "var(--sub)",
                        }}
                      >
                        {STATUS_LABELS[c.status] ?? c.status}
                      </span>
                    </Td>
                    <Td align="center">
                      {/* 행 전체가 이미 클릭 가능하지만 처음 보는 사람은 그걸 모른다 -
                          눈에 띄는 버튼을 따로 둬서 진입점을 명시한다. 행 onClick과
                          중복 실행되지 않게 stopPropagation. */}
                      <span
                        className={styles.detailBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/csp/clusters/${c.id}`);
                        }}
                      >
                        상세 →
                      </span>
                    </Td>
                  </tr>
                ))
              )
            )}
          </tbody>
        </table>

        {allClusters.length === 0 && (
          <div style={{ padding: 32, textAlign: "center", fontSize: 12.5, color: "var(--sub)" }}>
            등록된 클러스터가 없습니다.
          </div>
        )}
      </div>
    </main>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: ReactNode;
  align?: "left" | "right" | "center";
}) {
  return (
    <th
      style={{
        textAlign: align,
        padding: "11px 16px",
        fontSize: 13,
        fontWeight: 700,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color: "var(--sub)",
        fontFamily: "'IBM Plex Mono', monospace",
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
  mono,
  muted,
}: {
  children: ReactNode;
  align?: "left" | "right" | "center";
  mono?: boolean;
  muted?: boolean;
}) {
  return (
    <td
      style={{
        textAlign: align,
        padding: "12px 16px",
        color: muted ? "var(--sub)" : "var(--ink)",
        fontFamily: mono ? "'IBM Plex Mono', monospace" : "inherit",
      }}
    >
      {children}
    </td>
  );
}