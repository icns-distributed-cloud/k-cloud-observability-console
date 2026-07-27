"use client";
import { useEffect, useState } from "react";
import StatCard from "@/components/StatCard";
import ProgressBar from "@/components/ProgressBar";
import KindGlyph from "@/components/KindGlyph";
import NodeCard from "@/components/NodeCard";
import Breadcrumb from "@/components/Breadcrumb";
import { generateMetricSeries } from "@/lib/metrics";
import Card from "@/components/Card";
import Sparkline from "@/components/Sparkline";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function Home() {
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    fetch(`${API_URL}/health`)
      .then((res) => {
        if (!res.ok) throw new Error("bad response");
        return res.json();
      })
      .then(() => setStatus("ok"))
      .catch(() => setStatus("error"));
  }, []);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now() / 1000);
  }, []);
  const powerProfile = { metric_type: "power", baseline: "62", amplitude: "5", period_sec: 120, unit: "kW" }
  const utilProfile = { metric_type: "util", baseline: "74", amplitude: "6", period_sec: 90, unit: "%" }
  const slaProfile = { metric_type: "sla", baseline: "99", amplitude: "0.5", period_sec: 200, unit: "%" }
  return (
    <main style={{ padding: "2rem" }}>
      <h1>K-Cloud Observability Console</h1>
      <p>Backend status: {status}</p>

      <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
        <StatCard label="상태" value="ACTIVE" />
        <StatCard label="노드 수" value={6} />
        <StatCard label="평균 활용률" value={58} unit="%" />
      </div>

      <div style={{ marginTop: 24, width: 300 }}>
        <ProgressBar value={0.82} color="var(--gpu)" />
        <div style={{ height: 8 }} />
        <ProgressBar value={0.5} color="var(--npu)" />
        <div style={{ height: 8 }} />
        <ProgressBar value={0.05} />
      </div>

      <div style={{ display: "flex", gap: 12, marginTop: 24, alignItems: "center" }}>
        <KindGlyph kind="GPU" size={16} />
        <KindGlyph kind="NPU" size={16} />
        <KindGlyph kind="PIM" size={16} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12, marginTop: 24 }}>
        <NodeCard name="g0" kind="GPU" util={0.82} jobName="FedCare-BERT" jobColor="#6366F1" />
        <NodeCard name="n1" kind="NPU" util={0.54} jobName="MobileNetV2" jobColor="#D97706" hasAlert />
        <NodeCard name="p0" kind="PIM" util={0.05} />
      </div>

      <div style={{ marginTop: 24 }}>
        <Breadcrumb
          segments={[
            { label: "지도", onClick: () => alert("지도로 이동") },
            { label: "경희대 서울캠퍼스 A동", onClick: () => alert("클러스터로 이동") },
            { label: "노드 g0", onClick: () => alert("노드로 이동") },
            { label: "FedCare-BERT" },
          ]}
        />
      </div>
      {now && (
        <Card>
          <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 14 }}>실시간 모니터링</div>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            <Sparkline label="전력 (kW)" values={generateMetricSeries(powerProfile, now)} />
            <Sparkline label="활용률 (%)" values={generateMetricSeries(utilProfile, now)} />
            <Sparkline label="SLA 준수 (%)" values={generateMetricSeries(slaProfile, now)} />
          </div>
        </Card>
      )}
    </main>
  );
}