"use client";
import { useCallback, useEffect, useState } from "react"; import Tabs from "@/components/Tabs";
import { fetchJobs, stopJob } from "@/lib/api";
import { JOB_COLORS, JOB_STATUS_LABELS, jobCost, tierMix } from "@/lib/jobs";
import { elapsedLabel, hidesProgress, isContinuous, jobProgress } from "@/lib/jobMetrics";
import { useTime } from "@/lib/TimeContext";
import type { JobSummary } from "@/app/types";
import styles from "./JobTable.module.css";

const TYPE_LABELS: Record<string, string> = {
    train: "학습",
    infer: "추론",
};

const STATUS_COLORS: Record<string, string> = {
    running: "var(--active)",
    queued: "var(--alert-warning)",
    provisioning: "var(--alert-warning)",
    finalizing: "var(--positive)",
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
const W = { id: 70, user: 76, model: 205, resource: 132, nodes: 148, elapsed: 86, cost: 90, status: 70, action: 62 };
interface JobTableProps {
    /** 주면 그 사용자 작업만 조회한다 (CSC). 없으면 전체 (CSP) */
    userId?: number;
    /** 제출자 컬럼 표시 여부. CSC는 전부 자기 작업이라 의미가 없다 */
    showUser?: boolean;
    /** 추론 작업 중단 버튼 표시 여부. CSC에서만 쓴다 */
    showStop?: boolean;
    /** 행 클릭 시 이동할 경로. 화면마다 prefix가 달라서 밖에서 받는다 */
    onSelect: (jobId: number) => void;
    /** 총 건수를 바깥 헤더에 표시하려는 경우 */
    onCountChange?: (count: number) => void;
}

export default function JobTable({ userId, showUser, showStop, onSelect, onCountChange }: JobTableProps) {
    const { nowSec } = useTime();
    const [jobs, setJobs] = useState<JobSummary[]>([]);
    const [filter, setFilter] = useState("all");
    const [error, setError] = useState<string | null>(null);

    // 중지 버튼에서도 호출해야 해서 useEffect 밖에 둔다
    const load = useCallback(
        () =>
            fetchJobs({
                status: filter === "all" ? undefined : filter,
                userId,
            })
                .then((list) => {
                    setJobs(list);
                    onCountChange?.(list.length);
                })
                .catch((e) => setError(String(e))),
        // onCountChange는 매 렌더 새 함수일 수 있어 의존성에서 뺀다 (폴링이 재시작되지 않도록)
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [filter, userId]
    );

    useEffect(() => {
        load();
        // 백엔드에 push가 없으므로 주기적으로 다시 조회한다.
        // CSC에서 제출한 작업이 새로고침 없이 CSP 목록에도 나타나야 한다.
        const timer = setInterval(load, 10_000);
        return () => clearInterval(timer);
    }, [load]);

    if (error) return <div style={{ padding: 24 }}>불러오기 실패: {error}</div>;

    return (
        <>
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
                        {showUser && <Head w={W.user}>USER</Head>}
                        <Head w={W.model}>MODEL</Head>
                        <Head>PROGRESS</Head>
                        <Head w={W.elapsed}>ELAPSED</Head>
                        <Head w={W.resource}>RESOURCE</Head>
                        <Head w={W.nodes}>NODES</Head>
                        <Head w={W.cost} align="right">
                            COST
                        </Head>
                        <Head w={W.status} align="center">
                            STATUS
                        </Head>
                        {showStop && <Head w={W.action}>{null}</Head>}
                    </div>

                    {jobs.map((j) => {
                        const color = JOB_COLORS[j.type];
                        const progress = nowSec ? jobProgress(j, nowSec * 1000) : 0;
                        const mix = tierMix(j.selected_tier);
                        const cost = nowSec ? jobCost(j, nowSec * 1000) : 0;
                        const continuous = isContinuous(j);
                        const hideProgress = hidesProgress(j);
                        return (
                            <div
                                key={j.id}
                                className={styles.row}
                                onClick={() => onSelect(j.id)}
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

                                {showUser && (
                                    <span
                                        style={{
                                            width: W.user,
                                            flexShrink: 0,
                                            fontSize: 12.5,
                                            color: "var(--sub)",
                                            fontFamily: "'IBM Plex Mono', monospace",
                                        }}
                                    >
                                        U-{j.user_id}
                                    </span>
                                )}

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
                                    {hideProgress ? null : continuous ? (
                                        /* 서빙처럼 계속 도는 작업은 진행률 개념이 없다 */
                                        <span style={{ fontSize: 12.5, color: "var(--sub)" }}>
                                            지속 실행 중
                                        </span>
                                    ) : (
                                        <>
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
                                                        background:
                                                            j.status === "done" ? "var(--sub)" : color,
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
                                        </>
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
                                        width: W.resource,
                                        flexShrink: 0,
                                        fontSize: 12.5,
                                        color: "var(--sub)",
                                        fontFamily: "'IBM Plex Mono', monospace",
                                    }}
                                >
                                    {mix || "—"}
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
                                    {j.assigned_nodes.length ? (
                                        j.assigned_nodes.map((n) => (
                                            <span
                                                key={n.node_id}
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
                                                {n.node_name}
                                            </span>
                                        ))
                                    ) : (
                                        <span style={{ fontSize: 12.5, color: "var(--sub)" }}>
                                            미배정
                                        </span>
                                    )}
                                </div>

                                <span
                                    style={{
                                        width: W.cost,
                                        flexShrink: 0,
                                        textAlign: "right",
                                        fontSize: 13,
                                        fontFamily: "'IBM Plex Mono', monospace",
                                    }}
                                >
                                    {/* 온프레미스(단가 0)나 Tier 미지정 작업은 인프라 화면과 같이 "—" */}
                                    {cost === 0 ? "—" : `${cost.toFixed(2)} credit`}
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

                                {showStop && (
                                    <span
                                        style={{ width: W.action, flexShrink: 0, textAlign: "center" }}
                                    >
                                        {continuous && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();   // 행 클릭(상세 이동)과 겹치지 않게
                                                    stopJob(j.id)
                                                        .then(() => load())
                                                        .catch((err) => setError(String(err)));
                                                }}
                                                style={{
                                                    border: "1px solid var(--line)",
                                                    background: "transparent",
                                                    color: "var(--sub)",
                                                    borderRadius: 6,
                                                    padding: "4px 10px",
                                                    cursor: "pointer",
                                                    fontFamily: "inherit",
                                                    fontSize: 12,
                                                    fontWeight: 600,
                                                }}
                                            >
                                                중지
                                            </button>
                                        )}
                                    </span>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </>
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