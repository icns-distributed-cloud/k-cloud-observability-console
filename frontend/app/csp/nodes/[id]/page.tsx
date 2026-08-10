"use client";
import { use, useEffect, useState } from "react";
import Breadcrumb from "@/components/Breadcrumb";
import StatCard from "@/components/StatCard";
import KindGlyph from "@/components/KindGlyph";
import { fetchClusterAssignments, fetchClusterDetail, fetchJobs, fetchNodeDetail } from "@/lib/api";
import { JOB_COLORS, JOB_STATUS_LABELS, mapNodeJobs } from "@/lib/jobs";
import type { JobSummary, NodeDetail } from "@/app/types";
import { useRouter } from "next/navigation";
import Card from "@/components/Card";
import Sparkline from "@/components/Sparkline";
import { generateMetricSeries } from "@/lib/metrics";
import { useTime } from "@/lib/TimeContext";

const TYPE_LABELS: Record<string, string> = {
  train: "학습",
  infer: "추론",
};

const SECTION_LABEL: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--sub)",
  marginBottom: 12,
  fontFamily: "'IBM Plex Mono', monospace",
};

const METRIC_LABELS: Record<string, string> = {
  util: "활용률 (%)",
  cpu: "CPU (%)",
  mem: "메모리 (%)",
  temp: "온도 (°C)",
  power: "전력 (W)",
};

export default function NodePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const nodeId = Number(id);
  const router = useRouter();

  const [node, setNode] = useState<NodeDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<JobSummary | undefined>(undefined);
  const [clusterName, setClusterName] = useState<string>("");
  const { nowSec } = useTime();

  useEffect(() => {
    fetchNodeDetail(nodeId)
      .then(async (n) => {
        setNode(n);
        const [assignments, jobs] = await Promise.all([
          fetchClusterAssignments(n.cluster_id),
          // 필러 작업도 노드를 실제로 점유하므로 포함해야 "유휴" 판정이 맞는다
          fetchJobs({ includeFilters: true }),]);
        setJob(mapNodeJobs(assignments, jobs)[n.id]);
        const c = await fetchClusterDetail(n.cluster_id).catch(() => null);
        setClusterName(c?.name ?? `클러스터 ${n.cluster_id}`);
      })
      .catch((e) => setError(String(e)));
  }, [nodeId]);

  if (error) return <main style={{ padding: 24 }}>불러오기 실패: {error}</main>;
  if (!node) return <main style={{ padding: 24 }}>불러오는 중…</main>;

  const isIdle = !job;

  return (
    <main style={{ padding: "24px 28px" }}>
      <Breadcrumb
        segments={[
          { label: "지도", onClick: () => router.push("/csp") },
          {
            label: clusterName || `클러스터 ${node.cluster_id}`,
            onClick: () => router.push(`/csp/clusters/${node.cluster_id}`),
          },
          { label: `노드 ${node.name}` },
        ]}
      />

      <div style={{ margin: "16px 0 20px" }}>
        <div style={{ fontSize: 27, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
          {node.name}
        </div>
        <div style={{ fontSize: 17, color: "var(--sub)", marginTop: 4 }}>
          {clusterName || `클러스터 ${node.cluster_id}`}
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <StatCard label="상태" value={isIdle ? "유휴" : "가동중"} />
        <StatCard label="가속기" value={node.accelerators.reduce((n, a) => n + a.count, 0)} unit="개" />
      </div>

      {nowSec !== null && node.metric_profiles.length > 0 && (
        <>
          <div style={SECTION_LABEL}>실시간 모니터링</div>
          <div style={{ marginBottom: 24 }}>
            <Card>
              <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                {node.metric_profiles.map((m) => (
                  <Sparkline
                    key={m.metric_type}
                    label={METRIC_LABELS[m.metric_type] ?? m.metric_type}
                    values={generateMetricSeries(m, nowSec, 90, 14)}
                  />
                ))}
              </div>
            </Card>
          </div>
        </>
      )}

      <div style={SECTION_LABEL}>실행 중인 작업</div>

      {job ? (
        <div
          onClick={() =>
            router.push(`/csp/clusters/${node.cluster_id}/nodes/${node.id}/jobs/${job.id}`)
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
            <div style={{ fontWeight: 700, fontSize: 19, color: JOB_COLORS[job.type] }}>
              {job.model_name}
            </div>
            <div style={{ fontSize: 15, color: "var(--sub)", marginTop: 2 }}>
              {TYPE_LABELS[job.type] ?? job.type} · {JOB_STATUS_LABELS[job.status] ?? job.status}            </div>
          </div>
          <span style={{ marginLeft: "auto", fontSize: 15, color: "var(--sub)" }}>
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
            fontSize: 17,
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
            <span style={{ fontWeight: 700, fontSize: 19 }}>{acc.model_name}</span>
            <span
              style={{ fontSize: 15, color: "var(--sub)", fontFamily: "'IBM Plex Mono', monospace" }}
            >
              ×{acc.count}
            </span>
            <span
              style={{
                marginLeft: "auto",
                fontSize: 15,
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