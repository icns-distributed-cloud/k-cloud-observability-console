"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Breadcrumb from "@/components/Breadcrumb";
import Tabs from "@/components/Tabs";
import { fetchJobAssignments, fetchJobs, fetchNodeDetail, fetchProviders } from "@/lib/api";
import { JOB_COLORS, JOB_STATUS_LABELS, jobResources } from "@/lib/jobs";
import { elapsedLabel, jobProgress } from "@/lib/jobMetrics";
import { flattenRegions } from "@/lib/mapData";
import { useTime } from "@/lib/TimeContext";
import type { AssignmentItem, JobSummary, NodeDetail } from "@/app/types";

const TYPE_LABELS: Record<string, string> = {
    train: "학습",
    infer: "추론",
    distributed: "분산학습",
};

const STATUS_COLORS: Record<string, string> = {
    running: "var(--active)",
    queued: "var(--alert-warning)",
    done: "var(--sub)",
    failed: "var(--alert-critical)",
};

const FILTERS = [
    { id: "all", label: "전체" },
    { id: "queued", label: "대기중" },
    { id: "running", label: "실행중" },
    { id: "done", label: "완료" },
];

/** 컬럼 폭. 헤더와 행이 같은 값을 쓴다 (PROGRESS만 남은 폭을 차지) */
const W = { id: 70, model: 205, resource: 132, nodes: 148, elapsed: 86, cost: 72, status: 70 };

interface RawResources {
    assignments: AssignmentItem[];
    nodes: NodeDetail[];
    costPerHourByCluster: Record<number, number>;
}

export default function JobListPage() {
    const router = useRouter();
    const { nowSec } = useTime();
    const [jobs, setJobs] = useState<JobSummary[]>([]);
    const [filter, setFilter] = useState("all");
    const [error, setError] = useState<string | null>(null);
    /** null이면 아직 로딩 중 (자원 칸만 비워둔다) */
    const [raw, setRaw] = useState<RawResources | null>(null);

    useEffect(() => {
        fetchJobs(filter === "all" ? undefined : { status: filter })
            .then(setJobs)
            .catch((e) => setError(String(e)));
    }, [filter]);

    // 작업별 할당을 직접 조회한 뒤, 쓰인 노드의 이름·가속기와 클러스터 단가를 받아온다.
    // 할당은 node_id만 주므로 나머지는 노드 상세에서 (중복 제거해서 노드당 1회),
    // 시간당 단가는 provider 트리 한 번으로 전 클러스터를 받는다.
    // 실패한 호출은 건너뛰고 나머지로 진행 (작업 목록 자체는 이미 떠 있다).
    useEffect(() => {
        if (jobs.length === 0) {
            setRaw({ assignments: [], nodes: [], costPerHourByCluster: {} });
            return;
        }
        let cancelled = false;

        Promise.all(jobs.map((j) => fetchJobAssignments(j.id).catch(() => [])))
            .then(async (lists) => {
                const assignments = lists.flat();
                const nodeIds = [...new Set(assignments.map((a) => a.node_id))];
                const [nodes, providers] = await Promise.all([
                    Promise.all(nodeIds.map((id) => fetchNodeDetail(id).catch(() => null))),
                    fetchProviders().catch(() => []),
                ]);
                if (cancelled) return;

                const costPerHourByCluster: Record<number, number> = {};
                for (const r of flattenRegions(providers)) {
                    for (const c of r.clusters) costPerHourByCluster[c.id] = Number(c.cost_per_hour);
                }

                setRaw({
                    assignments,
                    nodes: nodes.filter((n): n is NodeDetail => n !== null),
                    costPerHourByCluster,
                });
            })
            .catch(() => {
                if (!cancelled) setRaw({ assignments: [], nodes: [], costPerHourByCluster: {} });
            });

        return () => {
            cancelled = true;
        };
    }, [jobs]);

    // 진행 중 작업은 비용도 같이 흐르므로 매 틱 다시 계산한다
    const resources =
        raw && nowSec !== null
            ? jobResources(raw.assignments, raw.nodes, raw.costPerHourByCluster, nowSec * 1000)
            : null;

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
                <div
                    style={{
                        background: "var(--panel)",
                        border: "1px solid var(--line)",
                        borderRadius: 12,
                        overflow: "hidden",
                    }}
                >
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 12,
                            padding: "11px 16px 11px 19px",   // 행의 좌측 3px 색띠만큼 맞춤
                            background: "var(--panel-2)",
                        }}
                    >
                        <Head w={W.id}>JOB ID</Head>
                        <Head w={W.model}>MODEL</Head>
                        <Head>PROGRESS</Head>
                        <Head w={W.resource}>RESOURCE</Head>
                        <Head w={W.nodes}>NODES</Head>
                        <Head w={W.elapsed}>ELAPSED</Head>
                        <Head w={W.cost} align="right">
                            COST
                        </Head>
                        <Head w={W.status} align="center">
                            STATUS
                        </Head>
                    </div>

                    {jobs.map((j) => {
                        const color = JOB_COLORS[j.type];
                        const progress = nowSec ? jobProgress(j, nowSec * 1000) : 0;
                        const res = resources?.[j.id];
                        return (
                            <div
                                key={j.id}
                                onClick={() => router.push(`/jobs/${j.id}`)}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 12,
                                    padding: "13px 16px",
                                    borderTop: "1px solid var(--line)",
                                    borderLeft: `3px solid ${color}`,
                                    cursor: "pointer",
                                }}
                            >
                                <span
                                    style={{
                                        width: W.id,
                                        flexShrink: 0,
                                        fontSize: 14,
                                        fontWeight: 700,
                                        fontFamily: "'IBM Plex Mono', monospace",
                                    }}
                                >
                                    J-{j.id}
                                </span>

                                <div
                                    style={{
                                        width: W.model,
                                        flexShrink: 0,
                                        overflow: "hidden",
                                        whiteSpace: "nowrap",
                                        textOverflow: "ellipsis",
                                    }}
                                >
                                    <div style={{ fontSize: 15.5, fontWeight: 700, color }}>
                                        {j.model_name}
                                    </div>
                                    <div style={{ fontSize: 12.5, color: "var(--sub)", marginTop: 2 }}>
                                        {TYPE_LABELS[j.type] ?? j.type} · 배치 {j.batch}
                                        {j.dataset_name && ` · ${j.dataset_name}`}
                                    </div>
                                </div>

                                <div
                                    style={{
                                        flex: "1 1 0",
                                        minWidth: 150,
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 8,
                                    }}
                                >
                                    <div
                                        style={{
                                            flex: 1,
                                            height: 5,
                                            borderRadius: 3,
                                            background: "var(--panel-2)",
                                            overflow: "hidden",
                                        }}
                                    >
                                        <div
                                            style={{
                                                width: `${progress * 100}%`,
                                                height: "100%",
                                                background: j.status === "done" ? "var(--sub)" : color,
                                            }}
                                        />
                                    </div>
                                    <span
                                        style={{
                                            fontSize: 12.5,
                                            color: "var(--sub)",
                                            fontFamily: "'IBM Plex Mono', monospace",
                                            flexShrink: 0,
                                            width: 38,
                                            textAlign: "right",
                                        }}
                                    >
                                        {Math.round(progress * 100)}%
                                    </span>
                                </div>

                                <span
                                    style={{
                                        width: W.resource,
                                        flexShrink: 0,
                                        fontSize: 12.5,
                                        color: "var(--sub)",
                                        fontFamily: "'IBM Plex Mono', monospace",
                                    }}
                                >
                                    {res?.mix || (resources === null ? "" : "—")}
                                </span>

                                <div
                                    style={{
                                        width: W.nodes,
                                        flexShrink: 0,
                                        display: "flex",
                                        gap: 4,
                                        flexWrap: "wrap",
                                    }}
                                >
                                    {res?.nodes.length ? (
                                        res.nodes.map((n) => (
                                            <span
                                                key={n}
                                                style={{
                                                    fontSize: 12,
                                                    fontWeight: 600,
                                                    fontFamily: "'IBM Plex Mono', monospace",
                                                    background: "var(--panel-2)",
                                                    border: "1px solid var(--line)",
                                                    borderRadius: 5,
                                                    padding: "3px 7px",
                                                }}
                                            >
                                                {n}
                                            </span>
                                        ))
                                    ) : (
                                        <span style={{ fontSize: 12.5, color: "var(--sub)" }}>
                                            {resources === null ? "" : "미배정"}
                                        </span>
                                    )}
                                </div>

                                <span
                                    style={{
                                        width: W.elapsed,
                                        flexShrink: 0,
                                        fontSize: 12.5,
                                        color: "var(--sub)",
                                        fontFamily: "'IBM Plex Mono', monospace",
                                    }}
                                >
                                    {nowSec === null ? "" : elapsedLabel(j, nowSec * 1000)}
                                </span>

                                <span
                                    style={{
                                        width: W.cost,
                                        flexShrink: 0,
                                        textAlign: "right",
                                        fontSize: 13,
                                        fontFamily: "'IBM Plex Mono', monospace",
                                    }}
                                >
                                    {/* 무상 클러스터(단가 0)는 인프라 화면과 같이 "—" 로 */}
                                    {!res || res.cost === 0 ? "—" : `$${res.cost.toFixed(2)}`}
                                </span>

                                <span
                                    style={{
                                        width: W.status,
                                        flexShrink: 0,
                                        textAlign: "center",
                                        fontSize: 12,
                                        fontWeight: 700,
                                        color: STATUS_COLORS[j.status] ?? "var(--sub)",
                                        background: "var(--panel-2)",
                                        border: "1px solid var(--line)",
                                        borderRadius: 6,
                                        padding: "4px 0",
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

function Head({
    children,
    w,
    align,
}: {
    children: React.ReactNode;
    w?: number;
    align?: "right" | "center";
}) {
    return (
        <span
            style={{
                width: w,
                flex: w ? "0 0 auto" : "1 1 0",
                minWidth: w ? undefined : 150,
                textAlign: align,
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.05em",
                color: "var(--sub)",
                fontFamily: "'IBM Plex Mono', monospace",
            }}
        >
            {children}
        </span>
    );
}
