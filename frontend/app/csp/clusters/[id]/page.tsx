"use client";
import { use, useEffect, useState } from "react";
import Breadcrumb from "@/components/Breadcrumb";
import StatCard from "@/components/StatCard";
import NodeCard from "@/components/NodeCard";
import Card from "@/components/Card";
import Sparkline from "@/components/Sparkline";
import { generateMetricSeries } from "@/lib/metrics";
import {
  fetchClusterAssignments,
  fetchClusterDetail,
  fetchClusterMetrics,
  fetchJobs,
} from "@/lib/api";
import { JOB_COLORS, mapNodeJobs } from "@/lib/jobs";
import type {
  AcceleratorKind,
  ClusterDetail,
  JobSummary,
  MetricProfilePoint,
} from "@/app/types";
import { useRouter } from "next/navigation";
import { useTime } from "@/lib/TimeContext";

const METRIC_LABELS: Record<string, string> = {
  power: "전력 (kW)",
  utilization: "활용률 (%)",
  sla: "SLA 준수 (%)",
};

export default function ClusterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const clusterId = Number(id);
  const router = useRouter();

  const [cluster, setCluster] = useState<ClusterDetail | null>(null);
  const [metrics, setMetrics] = useState<MetricProfilePoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [nodeJobs, setNodeJobs] = useState<Record<number, JobSummary | undefined>>({});

  const { nowSec: now } = useTime();

  useEffect(() => {
    Promise.all([
      fetchClusterDetail(clusterId),
      fetchClusterMetrics(clusterId),
      fetchClusterAssignments(clusterId),
      fetchJobs({ includeFilters: true }),
    ])
      .then(([c, m, assignments, jobs]) => {
        setCluster(c);
        setMetrics(m);
        setNodeJobs(mapNodeJobs(assignments, jobs));
      })
      .catch((e) => setError(String(e)));
  }, [clusterId]);

  // 노드의 활용률: metric_profiles에서 util 타입을 찾아 baseline을 사용
  const nodeUtil = (nodeId: number): number => {
    const node = cluster?.nodes.find((n) => n.id === nodeId);
    const util = node?.metric_profiles.find((m) => m.metric_type === "util");
    return util ? Number(util.baseline) / 100 : 0;
  };

  // 노드의 가속기 종류: accelerators에서 node_id로 찾기
  const nodeKind = (nodeId: number): AcceleratorKind => {
    const acc = cluster?.accelerators.find((a) => a.node_id === nodeId);
    return acc?.kind ?? "GPU";
  };

  const KIND_ORDER: Record<AcceleratorKind, number> = { GPU: 0, NPU: 1, PIM: 2 };

  if (error) return <main style={{ padding: 24 }}>불러오기 실패: {error}</main>;
  if (!cluster) return <main style={{ padding: 24 }}>불러오는 중…</main>;

  const sortedNodes = [...cluster.nodes].sort((a, b) => {
    const ka = KIND_ORDER[nodeKind(a.id)] ?? 9;
    const kb = KIND_ORDER[nodeKind(b.id)] ?? 9;
    return ka !== kb ? ka - kb : a.name.localeCompare(b.name);
  });

  return (
    <main style={{ padding: "24px 28px" }}>
      <Breadcrumb
        segments={[
          { label: "지도", onClick: () => router.push("/csp") },
          { label: cluster.name },
        ]}
      />

      <div style={{ margin: "16px 0 20px" }}>
        <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.01em" }}>
          {cluster.name}
        </div>
        <div style={{ fontSize: 12.5, color: "var(--sub)", marginTop: 4 }}>
          {cluster.status === "active" ? "가동중" : "대기"}
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <StatCard label="상태" value={cluster.status.toUpperCase()} />
        <StatCard label="노드 수" value={cluster.nodes.length} />
        <StatCard label="평균 활용률" value={Math.round(cluster.avg_util)} unit="%" />
      </div>

      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--sub)",
          marginBottom: 12,
          fontFamily: "'IBM Plex Mono', monospace",
        }}
      >
        노드
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: 12,
          marginBottom: 24,
        }}
      >
        {sortedNodes.map((node) => {
          const job = nodeJobs[node.id];
          return (
            <NodeCard
              key={node.id}
              name={node.name}
              util={nodeUtil(node.id)}
              jobName={job?.model_name}
              jobColor={job ? JOB_COLORS[job.type] : undefined}
              hasAlert={node.alerts.length > 0}
              alertSeverity={node.alerts[0]?.severity === "sla" ? "sla" : "physical"}
              onClick={() => router.push(`/csp/nodes/${node.id}`)}
            />
          );
        })}
      </div>

      {now && metrics.length > 0 && (
        <Card>
          <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 14 }}>
            실시간 모니터링
          </div>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            {metrics.map((m) => (
              <Sparkline
                key={m.metric_type}
                label={METRIC_LABELS[m.metric_type] ?? m.metric_type}
                values={generateMetricSeries(m, now, 90, 14)}
              />
            ))}
          </div>
        </Card>
      )}
    </main>
  );
}