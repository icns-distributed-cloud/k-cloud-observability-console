"use client";
import { use, useEffect, useState } from "react";
import Breadcrumb from "@/components/Breadcrumb";
import StatCard from "@/components/StatCard";
import KindGlyph from "@/components/KindGlyph";
import { fetchClusterAssignments, fetchJobs, fetchNodeDetail } from "@/lib/api";
import { JOB_COLORS, JOB_STATUS_LABELS, mapNodeJobs } from "@/lib/jobs";
import type { JobSummary, NodeDetail } from "@/app/types";
import { useRouter } from "next/navigation";

const SECTION_LABEL: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--sub)",
  marginBottom: 12,
  fontFamily: "'IBM Plex Mono', monospace",
};

export default function NodePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const nodeId = Number(id);
  const router = useRouter();

  const [node, setNode] = useState<NodeDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<JobSummary | undefined>(undefined);

  useEffect(() => {
    fetchNodeDetail(nodeId)
      .then(async (n) => {
        setNode(n);
        const [assignments, jobs] = await Promise.all([
          fetchClusterAssignments(n.cluster_id),
          fetchJobs(),
        ]);
        setJob(mapNodeJobs(assignments, jobs)[n.id]);
      })
      .catch((e) => setError(String(e)));
  }, [nodeId]);

  if (error) return <main style={{ padding: 24 }}>불러오기 실패: {error}</main>;
  if (!node) return <main style={{ padding: 24 }}>불러오는 중…</main>;

  const kind = node.accelerators[0]?.kind ?? "GPU";
  const utilProfile = node.metric_profiles.find((m) => m.metric_type === "util");
  const util = utilProfile ? Math.round(Number(utilProfile.baseline)) : 0;
  const isIdle = !job;

  return (
    <main style={{ padding: "24px 28px" }}>
      <Breadcrumb
        segments={[
          { label: "지도", onClick: () => router.push("/") },
          {
            label: `클러스터 ${node.cluster_id}`,
            onClick: () => router.push(`/clusters/${node.cluster_id}`),
          },
          { label: `노드 ${node.name}` },
        ]}
      />

      <div style={{ margin: "16px 0 20px" }}>
        <div style={{ fontSize: 20, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
          <KindGlyph kind={kind} size={16} />
          {node.name}
        </div>
        <div style={{ fontSize: 12.5, color: "var(--sub)", marginTop: 4 }}>
          클러스터 {node.cluster_id} · {kind}
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <StatCard label="종류" value={kind} />
        <StatCard label="활용률" value={util} unit="%" />
        <StatCard label="상태" value={isIdle ? "유휴" : "가동중"} />
      </div>

      {node.alerts.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          {node.alerts.map((a) => (
            <div
              key={a.id}
              style={{
                background: "var(--panel)",
                border: `1px solid ${a.severity === "physical" ? "#EF4444" : "#F59E0B"}`,
                borderRadius: 12,
                padding: "12px 14px",
                fontSize: 12.5,
                marginBottom: 8,
              }}
            >
              <span
                style={{
                  color: a.severity === "physical" ? "#EF4444" : "#F59E0B",
                  fontWeight: 700,
                }}
              >
                {a.severity === "physical" ? "물리" : "SLA"}
              </span>
              {" · "}
              {a.message}
            </div>
          ))}
        </div>
      )}

      <div style={SECTION_LABEL}>실행 중인 작업</div>

      {job ? (
        <div
          onClick={() =>
            router.push(`/clusters/${node.cluster_id}/nodes/${node.id}/jobs/${job.id}`)
          }
          style={{
            background: "var(--panel)",
            border: "1px solid var(--line)",
            borderRadius: 12,
            padding: "14px 16px",
            display: "flex",
            alignItems: "center",
            gap: 12,
            cursor: "pointer",
            marginBottom: 24,
          }}
        >
          <span
            style={{
              width: 9,
              height: 9,
              borderRadius: 2,
              background: JOB_COLORS[job.type],
              flexShrink: 0,
            }}
          />
          <div>
            <div style={{ fontWeight: 700, fontSize: 13.5, color: JOB_COLORS[job.type] }}>
              {job.model_name}
            </div>
            <div style={{ fontSize: 11.5, color: "var(--sub)", marginTop: 2 }}>
              {job.type} · {JOB_STATUS_LABELS[job.status] ?? job.status}
            </div>
          </div>
          <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--sub)" }}>
            상세 보기 ›
          </span>
        </div>
      ) : (
        <div
          style={{
            border: "1px dashed var(--line)",
            borderRadius: 12,
            padding: 24,
            textAlign: "center",
            fontSize: 12.5,
            color: "var(--sub)",
            marginBottom: 24,
          }}
        >
          현재 이 노드에서 실행 중인 작업이 없습니다.
        </div>
      )}

      <div style={SECTION_LABEL}>가속기</div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {node.accelerators.map((acc, i) => (
          <div
            key={i}
            style={{
              background: "var(--panel)",
              border: "1px solid var(--line)",
              borderRadius: 12,
              padding: "14px 16px",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <KindGlyph kind={acc.kind} size={14} />
            <span style={{ fontWeight: 700, fontSize: 13.5 }}>{acc.model_name}</span>
            <span
              style={{ fontSize: 11.5, color: "var(--sub)", fontFamily: "'IBM Plex Mono', monospace" }}
            >
              ×{acc.count}
            </span>
            <span
              style={{
                marginLeft: "auto",
                fontSize: 11.5,
                color: "var(--sub)",
                fontFamily: "'IBM Plex Mono', monospace",
              }}
            >
              {acc.tflops} TFLOPS · {acc.memory_gb}GB {acc.memory_type ?? ""} · {acc.tdp_w}W
            </span>
          </div>
        ))}
      </div>
    </main>
  );
}