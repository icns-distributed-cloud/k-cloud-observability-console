"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Breadcrumb from "@/components/Breadcrumb";
import Tabs from "@/components/Tabs";
import { fetchJobAssignments, fetchJobs, fetchNodeDetail } from "@/lib/api";
import { JOB_COLORS, JOB_STATUS_LABELS, PRIORITY_LABELS, mapJobNodes } from "@/lib/jobs";
import { jobProgress } from "@/lib/jobMetrics";
import { useTime } from "@/lib/TimeContext";
import type { JobSummary, NodeDetail } from "@/app/types";

const TYPE_LABELS: Record<string, string> = {
    train: "학습",
    infer: "추론",
    distributed: "분산학습",
};

/** ["srv-01", "srv-02", "srv-03"] → "srv-01 외 2" */
function nodeLabel(names: string[] | undefined) {
    if (!names?.length) return "-";
    return names.length > 1 ? `${names[0]} 외 ${names.length - 1}` : names[0];
}

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
    /** 작업 → 점유 노드 이름. null이면 아직 로딩 중 (노드 칸만 비워둔다) */
    const [jobNodes, setJobNodes] = useState<Record<number, string[]> | null>(null);

    useEffect(() => {
        fetchJobs(filter === "all" ? undefined : filter)
            .then(setJobs)
            .catch((e) => setError(String(e)));
    }, [filter]);

    // 작업별 할당을 직접 조회한 뒤, 점유 중인 노드의 이름만 추가로 받아 매핑을 만든다.
    // 할당은 node_id만 주므로 이름은 노드 상세에서 가져온다 (중복 제거해서 노드당 1회).
    // 실패한 호출은 건너뛰고 나머지로 진행 (작업 목록 자체는 이미 떠 있다).
    useEffect(() => {
        if (jobs.length === 0) {
            setJobNodes({});
            return;
        }
        let cancelled = false;

        Promise.all(jobs.map((j) => fetchJobAssignments(j.id).catch(() => [])))
            .then(async (lists) => {
                const active = lists.flat().filter((a) => a.to_t === null);
                const nodeIds = [...new Set(active.map((a) => a.node_id))];
                const nodes = await Promise.all(
                    nodeIds.map((id) => fetchNodeDetail(id).catch(() => null))
                );
                if (cancelled) return;

                setJobNodes(mapJobNodes(active, nodes.filter((n): n is NodeDetail => n !== null)));
            })
            .catch(() => {
                if (!cancelled) setJobNodes({});
            });

        return () => {
            cancelled = true;
        };
    }, [jobs]);

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

            <div style={{ marginBottom: 16 }}>
                <button
                    onClick={() => router.push("/jobs/new")}
                    style={{
                        border: "none",
                        background: "var(--accent)",
                        color: "#fff",
                        borderRadius: 8,
                        padding: "8px 16px",
                        cursor: "pointer",
                        fontFamily: "inherit",
                        fontSize: 12.5,
                        fontWeight: 700,
                    }}
                >
                    + 작업 제출
                </button>
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
                                        fontSize: 15,
                                        fontWeight: 600,
                                        color: "var(--sub)",
                                        fontFamily: "'IBM Plex Mono', monospace",
                                        minWidth: 100,
                                    }}
                                >
                                    {jobNodes === null ? "" : nodeLabel(jobNodes[j.id])}
                                </span>

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