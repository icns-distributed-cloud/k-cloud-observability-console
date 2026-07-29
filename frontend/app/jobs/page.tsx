"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Breadcrumb from "@/components/Breadcrumb";
import Tabs from "@/components/Tabs";
import { fetchJobs } from "@/lib/api";
import { JOB_COLORS, JOB_STATUS_LABELS, PRIORITY_LABELS } from "@/lib/jobs";
import { jobProgress } from "@/lib/jobMetrics";
import { useTime } from "@/lib/TimeContext";
import type { JobSummary } from "@/app/types";

const TYPE_LABELS: Record<string, string> = {
  train: "학습",
  infer: "추론",
  distributed: "분산학습",
};

const FILTERS = [
  { id: "all", label: "전체" },
  { id: "queued", label: "대기중" },
  { id: "running", label: "실행중" },
  { id: "done", label: "완료" },
];

export default function JobListPage() {
  const router = useRouter();
  const { nowSec } = useTime();
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchJobs(filter === "all" ? undefined : filter)
      .then(setJobs)
      .catch((e) => setError(String(e)));
  }, [filter]);

  if (error) return <main style={{ padding: 24 }}>불러오기 실패: {error}</main>;

  return (
    <main style={{ padding: "24px 28px" }}>
      <Breadcrumb
        segments={[
          { label: "지도", onClick: () => router.push("/") },
          { label: "작업 목록" },
        ]}
      />

      <div style={{ margin: "16px 0 20px" }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>작업 목록</div>
        <div style={{ fontSize: 12.5, color: "var(--sub)", marginTop: 4 }}>
          총 {jobs.length}건
        </div>
      </div>

      <Tabs items={FILTERS} active={filter} onChange={setFilter} />

      {jobs.length === 0 ? (
        <div
          style={{
            border: "1px dashed var(--line)",
            borderRadius: 12,
            padding: 32,
            textAlign: "center",
            fontSize: 12.5,
            color: "var(--sub)",
          }}
        >
          해당 조건의 작업이 없습니다.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {jobs.map((j) => {
            const color = JOB_COLORS[j.type];
            const progress = nowSec ? jobProgress(j, nowSec * 1000) : 0;
            return (
              <div
                key={j.id}
                onClick={() => router.push(`/jobs/${j.id}`)}
                style={{
                  background: "var(--panel)",
                  border: "1px solid var(--line)",
                  borderLeft: `3px solid ${color}`,
                  borderRadius: 12,
                  padding: "14px 16px",
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  cursor: "pointer",
                }}
              >
                <div style={{ minWidth: 150 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color }}>
                    {j.model_name}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--sub)", marginTop: 2 }}>
                    {TYPE_LABELS[j.type] ?? j.type} · 배치 {j.batch} · {j.precision}
                  </div>
                </div>

                <div style={{ flex: 1, minWidth: 120 }}>
                  <div
                    style={{
                      height: 4,
                      borderRadius: 2,
                      background: "var(--panel-2)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${progress * 100}%`,
                        height: "100%",
                        background: color,
                      }}
                    />
                  </div>
                  <div
                    style={{
                      fontSize: 10.5,
                      color: "var(--sub)",
                      marginTop: 4,
                      fontFamily: "'IBM Plex Mono', monospace",
                    }}
                  >
                    {Math.round(progress * 100)}%
                  </div>
                </div>

                <span
                  style={{
                    fontSize: 11,
                    color: "var(--sub)",
                    fontFamily: "'IBM Plex Mono', monospace",
                    minWidth: 70,
                  }}
                >
                  {PRIORITY_LABELS[j.priority_pref] ?? j.priority_pref}
                </span>

                <span
                  style={{
                    fontSize: 11.5,
                    fontWeight: 700,
                    color: j.status === "running" ? color : "var(--sub)",
                    minWidth: 50,
                    textAlign: "right",
                  }}
                >
                  {JOB_STATUS_LABELS[j.status] ?? j.status}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}