"use client";
import { useEffect, useState, type CSSProperties } from "react";
import Breadcrumb from "@/components/Breadcrumb";
import StatCard from "@/components/StatCard";
import Card from "@/components/Card";
import Tabs from "@/components/Tabs";
import ProgressBar from "@/components/ProgressBar";
import MetricChart from "@/components/MetricChart";
import ModelGraph from "@/components/ModelGraph";
import Sparkline from "@/components/Sparkline";
import { averageMetricSeries } from "@/lib/metrics";
import {
    fetchEvents,
    fetchHyperparamAdjustments,
    fetchJobDetail,
    fetchKqvBenchmark,
    fetchModelLayers,
    fetchNodeDetail,
    fetchReallocations,
    pauseJob,
    resumeJob,
    terminateJob,
} from "@/lib/api";
import { JOB_COLORS, JOB_STATUS_LABELS, JOB_STATUS_COLORS, PRIORITY_LABELS } from "@/lib/jobs";
import {
    cumulativeCount,
    formatMetricValue,
    liveMetricSeries,
    metricDisplay,
    metricSeries,
    trainingProgress,
} from "@/lib/jobMetrics";
import {
    formatMakespan,
    formatOffsetTime,
    sortAdjustments,
    summarizeReallocations,
} from "@/lib/jobOptimize";
import { useTime } from "@/lib/TimeContext";
import type {
    EventItem,
    EventType,
    HyperparamAdjustmentItem,
    JobDetail,
    JobKqvBenchmarkResponse,
    JobSummary,
    JobMetricProfileItem,
    MetricProfilePoint,
    ModelLayersResponse,
    NodeDetail,
    ReallocationItem,
} from "@/app/types";

const SECTION_LABEL: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--sub)",
    marginBottom: 12,
    fontFamily: "'IBM Plex Mono', monospace",
};

const TYPE_LABELS: Record<string, string> = {
    train: "학습",
    infer: "추론",
};

/** 노드 상세 페이지와 같은 라벨 - 여기서도 노드 단위 지표를 그대로 보여준다 */
const METRIC_LABELS: Record<string, string> = {
    util: "활용률 (%)",
    cpu: "CPU (%)",
    mem: "메모리 (%)",
    temp: "온도 (°C)",
    power: "전력 (W)",
};

interface Segment {
    label: string;
    onClick?: () => void;
}

interface JobDetailViewProps {
    jobId: number;
    /** 작업명 앞까지의 경로. 작업명 세그먼트는 내부에서 붙인다 */
    breadcrumbPrefix: Segment[];
    /** 추론 작업 중단 버튼 표시 여부. CSC에서만 쓴다 (JobTable의 showStop과 동일한 이유) */
    showStop?: boolean;
}

export default function JobDetailView({ jobId, breadcrumbPrefix }: JobDetailViewProps) {
    const { nowSec } = useTime();
    const now = nowSec === null ? null : nowSec * 1000;

    const [tab, setTab] = useState("overview");
    const [job, setJob] = useState<JobDetail | null>(null);
    const [kqv, setKqv] = useState<JobKqvBenchmarkResponse | null>(null);
    const [reallocs, setReallocs] = useState<ReallocationItem[]>([]);
    const [adjustments, setAdjustments] = useState<HyperparamAdjustmentItem[]>([]);
    const [modelLayers, setModelLayers] = useState<ModelLayersResponse | null>(null);
    const [events, setEvents] = useState<EventItem[]>([]);
    const [nodeDetails, setNodeDetails] = useState<NodeDetail[]>([]);
    const [error, setError] = useState<string | null>(null);
    // pause/resume/terminate가 전부 JobSummary를 돌려주므로 처리를 하나로 묶는다
    const [acting, setActing] = useState(false);
    const runAction = (p: Promise<JobSummary>) => {
        setActing(true);
        p.then((j) => setJob((prev) => (prev ? { ...prev, ...j } : prev)))
            .catch((e) => setError(String(e)))
            .finally(() => setActing(false));
    };

    useEffect(() => {
        Promise.all([
            fetchJobDetail(jobId),
            fetchKqvBenchmark(jobId).catch(() => null),
            fetchReallocations(jobId).catch(() => []),
            fetchHyperparamAdjustments(jobId).catch(() => []),
        ])
            .then(async ([j, k, r, a]) => {
                setJob(j);
                setKqv(k);
                setReallocs(r);
                setAdjustments(a);
                setModelLayers(await fetchModelLayers(j.model_id).catch(() => null));
            })
            .catch((e) => setError(String(e)));
    }, [jobId]);

    // 프로파일링 탭 전용 - job이 로드된 뒤에 한 번만 가져온다(배정 노드 목록이
    // job.assigned_nodes에서 나오므로 job보다 먼저는 못 부른다). 노드 상세는
    // ClusterDetail.nodes(NodeSummary)에 없는 가속기 스펙이 필요해서 노드마다 따로
    // 조회한다 - 스케줄러 페이지에서 이미 쓴 것과 같은 패턴.
    useEffect(() => {
        if (!job) return;
        fetchEvents(job.id).then(setEvents).catch(() => { });
        Promise.all(job.assigned_nodes.map((n) => fetchNodeDetail(n.node_id).catch(() => null))).then(
            (results) => setNodeDetails(results.filter((n): n is NodeDetail => n !== null))
        );
    }, [job?.id]);

    // 백엔드에 push가 없어서, 페이지를 열어둔 채로 job이 (다른 탭에서 stop되는 등)
    // 상태가 바뀌면 화면이 그걸 못 따라간다 - 특히 무기한 실행되는 추론 job은
    // finished_at이 그대로 null로 남아있는 탓에 누적 요청 수 같은 지표가 실제로는
    // 멈췄는데 계속 올라가는 것처럼 보인다. done된 뒤로는 더 바뀔 게 없으니 그때까지만
    // 주기적으로 다시 조회한다.
    useEffect(() => {
        if (!job || job.status === "done") return;
        const timer = setInterval(() => {
            fetchJobDetail(jobId).then(setJob).catch(() => { });
        }, 10_000);
        return () => clearInterval(timer);
    }, [jobId, job?.status]);

    if (error) return <main style={{ padding: 24 }}>불러오기 실패: {error}</main>;
    if (!job) return <main style={{ padding: 24 }}>불러오는 중…</main>;

    const color = JOB_COLORS[job.type];
    const progress = trainingProgress(job, now);
    // 개요(진행 상황 요약)와 프로파일링(연구용 성능 측정치)이 job.metrics를 profiling
    // 플래그로 나눠 쓴다 - 추론은 진행률 개념이 없어 지표 전부가 profiling=true라
    // overview.featured가 항상 비어서 개요 탭엔 그래프가 안 뜬다(의도대로).
    const overview = pickMetricSection(job.metrics, false);
    const profilingMetrics = pickMetricSection(job.metrics, true);
    // 추론은 그래프 선(liveMetricSeries)에 잔물결을 얹으니, 우측 상단 "현재" 숫자도
    // 같은 값(그래프의 가장 오른쪽 점)을 가리켜야 그래프랑 숫자가 서로 다른 걸
    // 말하지 않는다 - progress 기반 metricDisplay는 웜업 이후 고정값이라 안 맞는다.
    const liveSeriesFor = (m: (typeof job.metrics)[number] | undefined) =>
        job.type === "infer" && now && m ? liveMetricSeries(m, job, now, 30) : null;
    const overviewLiveSeries = liveSeriesFor(overview.featured);
    const profilingLiveSeries = liveSeriesFor(profilingMetrics.featured);
    const realloc = summarizeReallocations(reallocs);

    // 배정 노드의 지표를 metric_type별로 묶는다. 분산 작업이면 노드가 여러 개라
    // 지점별 평균을 낸다 (스케줄러 페이지가 학습/추론 풀 평균 낼 때 쓰는 것과 같은 함수).
    const monitorTypes = [
        ...new Set(nodeDetails.flatMap((n) => n.metric_profiles.map((m) => m.metric_type))),
    ];
    const monitorMetrics = monitorTypes.map((type) => ({
        type,
        profiles: nodeDetails
            .map((n) => n.metric_profiles.find((m) => m.metric_type === type))
            .filter((m): m is MetricProfilePoint => m !== undefined),
    }));

    const tabs = [
        { id: "overview", label: "개요" },
        { id: "optimize", label: "최적화" },
        { id: "profiling", label: "프로파일링" },
    ];

    return (
        <main style={{ padding: "24px 28px" }}>
            <Breadcrumb segments={[...breadcrumbPrefix, { label: `J-${job.id}` }]} />

            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", margin: "16px 0 20px" }}>
                <div>
                    <div style={{ fontSize: 20, fontWeight: 700 }}>J-{job.id}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                        <span style={{ fontSize: 16, fontWeight: 700, color: "var(--ink)" }}>
                            {job.model_name}
                        </span>
                        <span
                            style={{
                                padding: "3px 10px",
                                borderRadius: 999,
                                fontSize: 12.5,
                                fontWeight: 700,
                                color: JOB_COLORS[job.type],
                                background: `color-mix(in srgb, ${JOB_COLORS[job.type]} 12%, var(--panel))`,
                                border: `1px solid color-mix(in srgb, ${JOB_COLORS[job.type]} 30%, transparent)`,
                            }}
                        >
                            {TYPE_LABELS[job.type] ?? job.type}
                        </span>
                        <span
                            style={{
                                padding: "3px 10px",
                                borderRadius: 999,
                                fontSize: 12.5,
                                fontWeight: 700,
                                color: JOB_STATUS_COLORS[job.status],
                                background: `color-mix(in srgb, ${JOB_STATUS_COLORS[job.status]} 14%, var(--panel))`,
                                border: `1px solid color-mix(in srgb, ${JOB_STATUS_COLORS[job.status]} 32%, transparent)`,
                            }}
                        >
                            {JOB_STATUS_LABELS[job.status] ?? job.status}
                        </span>
                    </div>
                </div>

                {/* done이 아니면 종료는 항상 가능하고, 일시중지/재개는 상태에 따라 하나만 뜬다 */}
                {job.status !== "done" && (
                    <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
                        {job.status === "paused" ? (
                            <button
                                disabled={acting}
                                onClick={() => runAction(resumeJob(job.id))}
                                style={actionBtnStyle(acting, "var(--accent)")}
                            >
                                {acting ? "재개 중…" : "재개"}
                            </button>
                        ) : (
                            /* 일시중지는 running만 받는다(그 외엔 400) - 눌러서 에러를 보느니
                               왜 못 누르는지 툴팁으로 알려주고 비활성화해둔다. */
                            <button
                                disabled={acting || job.status !== "running"}
                                title={job.status === "running" ? undefined : "실행 중인 작업만 일시중지할 수 있습니다"}
                                onClick={() => runAction(pauseJob(job.id))}
                                style={actionBtnStyle(acting || job.status !== "running", "var(--alert-warning)")}
                            >
                                {acting ? "중지 중…" : "일시중지"}
                            </button>
                        )}
                        <button
                            disabled={acting}
                            onClick={() => runAction(terminateJob(job.id))}
                            style={actionBtnStyle(acting, "var(--alert-critical)")}
                        >
                            {acting ? "종료 중…" : "종료"}
                        </button>
                    </div>
                )}
            </div>

            <Tabs items={tabs} active={tab} onChange={setTab} />

            {tab === "overview" && (
                <div>
                    {nowSec !== null && monitorMetrics.length > 0 && (
                        <>
                            <SectionHead
                                title="실시간 모니터링"
                                desc={job.assigned_nodes.map((n) => n.node_name).join(" · ")}
                            />
                            <div style={{ marginBottom: 24 }}>
                                <Card>
                                    <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                                        {monitorMetrics.map((m) => (
                                            <Sparkline
                                                key={m.type}
                                                label={METRIC_LABELS[m.type] ?? m.type}
                                                values={averageMetricSeries(m.profiles, nowSec, 90, 14)}
                                            />
                                        ))}
                                    </div>
                                </Card>
                            </div>
                        </>
                    )}

                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
                        {overview.others.map((m) => {
                            const d = metricDisplay(m, progress);
                            return (
                                <StatCard key={m.id} label={m.label} value={d.value} unit={d.unit ?? undefined} />
                            );
                        })}
                        {job.dataset_name && (
                            <StatCard label="데이터셋" value={job.dataset_name} />
                        )}
                        <StatCard label="배치 크기" value={job.batch} />
                        <StatCard
                            label="우선순위"
                            value={PRIORITY_LABELS[job.priority_pref] ?? job.priority_pref}
                        />
                    </div>

                    {job.type === "train" && (
                        <div style={{ marginBottom: 24 }}>
                            <div style={{ ...SECTION_LABEL, marginBottom: 8, display: "flex", alignItems: "baseline", gap: 8 }}>
                                <span>진행률</span>
                                {/* trainingProgress가 준비/마무리 단계엔 0 또는 1로 고정해서(중간에
                                    리셋된 것처럼 안 보이게) 막대 자체는 항상 단조증가하지만, 그것만
                                    으론 "왜 지금 안 움직이지"가 안 보이니 지금 무슨 단계인지 문구로
                                    같이 알려준다. */}
                                {(job.status === "provisioning" || job.status === "finalizing") && (
                                    <span
                                        style={{
                                            fontSize: 12.5,
                                            fontWeight: 600,
                                            textTransform: "none",
                                            letterSpacing: "normal",
                                            color: "var(--sub)",
                                        }}
                                    >
                                        ({job.status === "provisioning" ? "학습 준비 중" : "마무리 처리 중"})
                                    </span>
                                )}
                            </div>
                            <ProgressBar value={progress} color={color} thick />
                        </div>
                    )}

                    {overview.featured && now && (
                        <Card>
                            <MetricChart
                                title={`${TYPE_LABELS[job.type] ?? job.type} 현황`}
                                currentLabel={`현재 ${overview.featured.label}`}
                                currentValue={
                                    overviewLiveSeries
                                        ? formatMetricValue(overviewLiveSeries[overviewLiveSeries.length - 1])
                                        : metricDisplay(overview.featured, progress).value
                                }
                                unit={overview.featured.unit}
                                values={overviewLiveSeries ?? metricSeries(overview.featured, progress, 30)}
                                progress={job.type === "infer" ? 1 : progress}
                                color={color}
                                footerLeft={
                                    overview.counter
                                        ? job.type === "infer"
                                            ? `${overview.counter.label} ${cumulativeCount(Number(overview.featured.target_value ?? 0), job, now)}`
                                            : `${overview.counter.label} ${Math.round(progress * overview.counter.total_count!)} / ${overview.counter.total_count}`
                                        : undefined
                                }
                            />
                        </Card>
                    )}

                    {modelLayers && modelLayers.layers.length > 0 && (
                        <>
                            <div style={{ marginTop: 24 }}>
                                <SectionHead
                                    title="모델 분석"
                                    desc={
                                        job.dataset_name
                                            ? `${job.model_name} · ${job.dataset_name}`
                                            : job.model_name
                                    }
                                />
                            </div>
                            <Card>
                                <ModelGraph layers={modelLayers.layers} edges={modelLayers.edges} />
                            </Card>
                        </>
                    )}

                    <div style={{ marginTop: 24 }}>
                        <SectionHead title="하드웨어 프로파일" />
                    </div>
                    {nodeDetails.length === 0 ? (
                        <div
                            style={{
                                border: "1px dashed var(--line)",
                                borderRadius: 12,
                                padding: 24,
                                textAlign: "center",
                                fontSize: 12.5,
                                color: "var(--sub)",
                            }}
                        >
                            배정된 노드가 없습니다.
                        </div>
                    ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                            {nodeDetails.map((n) => (
                                <Card key={n.id}>
                                    <div
                                        style={{
                                            display: "flex",
                                            alignItems: "baseline",
                                            gap: 10,
                                            marginBottom: n.accelerators.length > 0 ? 12 : 0,
                                        }}
                                    >
                                        <span style={{ fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace" }}>
                                            {n.name}
                                        </span>
                                        <span style={{ fontSize: 12, color: "var(--sub)" }}>
                                            {n.purpose === "train" ? "학습" : "추론"} 노드
                                        </span>
                                    </div>
                                    {n.accelerators.length > 0 && (
                                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                                            {n.accelerators.map((a, i) => (
                                                <div
                                                    key={i}
                                                    style={{
                                                        border: "1px solid var(--line)",
                                                        borderRadius: 10,
                                                        padding: "8px 12px",
                                                        fontSize: 12.5,
                                                        minWidth: 180,
                                                    }}
                                                >
                                                    <div style={{ fontWeight: 700, marginBottom: 4 }}>
                                                        {a.model_name}
                                                        {a.count > 1 ? ` ×${a.count}` : ""}
                                                    </div>
                                                    <div style={{ color: "var(--sub)", fontFamily: "'IBM Plex Mono', monospace" }}>
                                                        {a.tflops} TFLOPS · {a.memory_gb}GB {a.memory_type ?? ""} · {a.tdp_w}W
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </Card>
                            ))}
                        </div>
                    )}

                    <div style={{ marginTop: 24 }}>
                        <SectionHead title="이벤트 타임라인" />
                    </div>
                    {events.length === 0 ? (
                        <div
                            style={{
                                border: "1px dashed var(--line)",
                                borderRadius: 12,
                                padding: 24,
                                textAlign: "center",
                                fontSize: 12.5,
                                color: "var(--sub)",
                            }}
                        >
                            기록된 이벤트가 없습니다.
                        </div>
                    ) : (
                        <Card>
                            {events.map((e, i) => (
                                <div
                                    key={e.id}
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 16,
                                        padding: "10px 0",
                                        borderTop: i > 0 ? "1px solid var(--line)" : "none",
                                        fontSize: 12.5,
                                    }}
                                >
                                    <span style={{ color: "var(--sub)", fontFamily: "'IBM Plex Mono', monospace", minWidth: 74 }}>
                                        {formatEventTime(e.occurred_at)}
                                    </span>
                                    <span style={{ fontWeight: 700, color, minWidth: 84 }}>
                                        {EVENT_TYPE_LABELS[e.type] ?? e.type}
                                    </span>
                                    <span style={{ color: "var(--sub)" }}>
                                        {e.node_id !== null
                                            ? job.assigned_nodes.find((n) => n.node_id === e.node_id)?.node_name ??
                                            `노드 #${e.node_id}`
                                            : "—"}
                                    </span>
                                </div>
                            ))}
                        </Card>
                    )}
                </div>
            )}

            {tab === "optimize" && (
                <div>
                    {kqv && kqv.kqv_gain_pct !== null && (
                        <>
                            <SectionHead title="KQV 할당" desc="노드 성능비 기반 shard 배분" />
                            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
                                <StatCard
                                    label="학습시간 감소"
                                    value={Number(kqv.kqv_gain_pct).toFixed(1)}
                                    unit="%"
                                />
                            </div>
                            <Card>
                                <div style={{ display: "flex", gap: 32, fontSize: 12.5 }}>
                                    <div>
                                        <div style={{ color: "var(--sub)", marginBottom: 4 }}>균등 분배</div>
                                        <div style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                                            추정 makespan {formatMakespan(kqv.kqv_even_makespan_sec)}
                                        </div>
                                    </div>
                                    <div>
                                        <div style={{ color: "var(--sub)", marginBottom: 4 }}>KQV 최적화</div>
                                        <div style={{ fontFamily: "'IBM Plex Mono', monospace", color }}>
                                            추정 makespan {formatMakespan(kqv.kqv_opt_makespan_sec)}
                                        </div>
                                    </div>
                                </div>
                            </Card>
                            <div style={{ height: 24 }} />
                        </>
                    )}

                    <div style={SECTION_LABEL}>무중단 재할당</div>
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
                        <StatCard label="자원 변경" value={realloc.count} unit="회" />
                        <StatCard label="중단 시간" value={realloc.downtimeSec} unit="초" />
                        <StatCard label="재개 지연" value={`${realloc.resumeDelaySec}s`} />
                    </div>

                    {job.cache && (
                        <>
                            <div style={SECTION_LABEL}>캐싱</div>
                            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
                                <StatCard
                                    label="접근시간 감소"
                                    value={Number(job.cache.latency_reduction_pct).toFixed(0)}
                                    unit="%"
                                />
                            </div>
                            <Card>
                                {job.cache.tiers.map((t, i) => (
                                    <div key={t.id} style={{ marginTop: i > 0 ? 14 : 0 }}>
                                        <div
                                            style={{
                                                display: "flex",
                                                justifyContent: "space-between",
                                                fontSize: 12,
                                                marginBottom: 6,
                                            }}
                                        >
                                            <span style={{ fontWeight: 700 }}>{t.tier_name}</span>
                                            <span
                                                style={{ color: "var(--sub)", fontFamily: "'IBM Plex Mono', monospace" }}
                                            >
                                                {Number(t.fill_pct).toFixed(0)}% · {Number(t.latency_ms)}ms
                                            </span>
                                        </div>
                                        <ProgressBar value={Number(t.fill_pct) / 100} color={color} />
                                    </div>
                                ))}
                            </Card>
                            <div style={{ height: 24 }} />
                        </>
                    )}

                    {adjustments.length > 0 && (
                        <>
                            <SectionHead title="하이퍼파라미터 (DART)" desc="보상 신호 기반 조정 이력" />
                            <Card>
                                {sortAdjustments(adjustments).map((a, i) => (
                                    <div
                                        key={a.id}
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 16,
                                            padding: "10px 0",
                                            borderTop: i > 0 ? "1px solid var(--line)" : "none",
                                            fontSize: 12.5,
                                        }}
                                    >
                                        <span
                                            style={{
                                                color: "var(--sub)",
                                                fontFamily: "'IBM Plex Mono', monospace",
                                                minWidth: 64,
                                            }}
                                        >
                                            {formatOffsetTime(job.started_at, a.t_offset_sec)}
                                        </span>
                                        <span style={{ fontWeight: 700, minWidth: 90 }}>{a.param_name}</span>
                                        <span style={{ color: "var(--sub)" }}>
                                            {a.from_value} → {a.to_value}
                                        </span>
                                        <span
                                            style={{
                                                marginLeft: "auto",
                                                color: "var(--positive)",
                                                fontFamily: "'IBM Plex Mono', monospace",
                                            }}
                                        >
                                            {a.reward}
                                        </span>
                                    </div>
                                ))}
                            </Card>
                        </>
                    )}

                </div>
            )}

            {tab === "profiling" && (
                <div>
                    {profilingMetrics.others.length > 0 && (
                        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
                            {profilingMetrics.others.map((m) => {
                                // 누적 요청 수처럼 total_count가 있는 지표는 보통 featured 그래프
                                // 각주로 붙는데, 이 섹션엔 featured가 없을 수 있다(추론 프로파일링 -
                                // 처리량 그래프가 개요로 빠졌으므로). 그래도 progress 기반
                                // metricDisplay를 그대로 쓰면 무기한 실행되는 추론엔 안 맞으니
                                // (진행률 개념이 없음), 개요 쪽 featured(처리량)의 target_value를
                                // 속도로 빌려서 cumulativeCount로 계산한다.
                                if (job.type === "infer" && m.total_count !== null && now) {
                                    const rate = Number(overview.featured?.target_value ?? 0);
                                    return (
                                        <StatCard key={m.id} label={m.label} value={cumulativeCount(rate, job, now)} />
                                    );
                                }
                                const d = metricDisplay(m, progress);
                                return (
                                    <StatCard key={m.id} label={m.label} value={d.value} unit={d.unit ?? undefined} />
                                );
                            })}
                        </div>
                    )}

                    {profilingMetrics.featured && now && (
                        <Card>
                            <MetricChart
                                title={`${TYPE_LABELS[job.type] ?? job.type} 성능 프로파일`}
                                currentLabel={`현재 ${profilingMetrics.featured.label}`}
                                currentValue={
                                    profilingLiveSeries
                                        ? formatMetricValue(profilingLiveSeries[profilingLiveSeries.length - 1])
                                        : metricDisplay(profilingMetrics.featured, progress).value
                                }
                                unit={profilingMetrics.featured.unit}
                                values={profilingLiveSeries ?? metricSeries(profilingMetrics.featured, progress, 30)}
                                progress={job.type === "infer" ? 1 : progress}
                                color={color}
                                footerLeft={
                                    profilingMetrics.counter
                                        ? job.type === "infer"
                                            ? `${profilingMetrics.counter.label} ${cumulativeCount(Number(profilingMetrics.featured.target_value ?? 0), job, now)}`
                                            : `${profilingMetrics.counter.label} ${Math.round(progress * profilingMetrics.counter.total_count!)} / ${profilingMetrics.counter.total_count}`
                                        : undefined
                                }
                            />
                        </Card>
                    )}
                </div>
            )}

        </main>
    );
}

const EVENT_TYPE_LABELS: Record<EventType, string> = {
    ARRIVAL: "도착",
    QUEUE: "대기열 유지",
    BACKFILL: "백필 배정",
    START: "즉시 배정",
    PAUSE: "일시중지",
    RESUME: "재개",
    TERMINATE: "종료",
    FINISH: "노드 해제",
};

/** occurred_at(절대 시각 ISO 문자열) → "12:04:02" */
function formatEventTime(occurredAt: string): string {
    return new Date(occurredAt).toLocaleTimeString("ko-KR", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    });
}

/** job.metrics를 profiling 플래그로 나눠, featured(대표 그래프)/counter(누적 카운터)/
 *  others(나머지 StatCard용)로 분리한다. 개요 탭은 profiling=false로, 프로파일링
 *  탭은 profiling=true로 각각 부른다 - 같은 로직을 섹션마다 반복하지 않기 위해서다. */
function pickMetricSection(metrics: JobMetricProfileItem[], profiling: boolean) {
    const scoped = metrics.filter((m) => m.profiling === profiling);
    const featured = scoped.find((m) => m.featured);
    // counter(에포크/누적 요청 수 같은 총량 지표)는 featured 그래프의 하단 각주로만
    // 쓴다 - 이 섹션에 featured가 없으면(추론 프로파일링처럼 처리량 그래프가 개요로
    // 빠진 경우) 붙일 그래프가 없으니 others에 그냥 일반 StatCard로 남긴다.
    const counter = featured ? scoped.find((m) => !m.featured && m.total_count !== null) : undefined;
    const others = [...scoped]
        .filter((m) => !m.featured && m.id !== counter?.id)
        .sort((a, b) => a.seq - b.seq);
    return { featured, counter, others };
}

/** 헤더 우측 액션 버튼(일시중지·재개·종료) 공통 스타일 */
function actionBtnStyle(disabled: boolean, color?: string): CSSProperties {
    return {
        // 비활성일 땐 색을 빼고 회색으로 - 흐려진 빨강은 "고장난 버튼"처럼 보인다
        border: `1px solid ${disabled || !color ? "var(--line)" : color}`,
        background: disabled || !color ? "transparent" : `color-mix(in srgb, ${color} 10%, var(--panel))`,
        color: disabled || !color ? "var(--sub)" : color,
        borderRadius: 8,
        padding: "11px 22px",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.45 : 1,
        fontFamily: "inherit",
        fontSize: 15,
        fontWeight: 700,
    };
}

function SectionHead({ title, desc }: { title: string; desc?: string }) {
    return (
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12 }}>
            <span
                style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "var(--sub)",
                    fontFamily: "'IBM Plex Mono', monospace",
                }}
            >
                {title}
            </span>
            {desc && <span style={{ fontSize: 11.5, color: "var(--sub)", opacity: 0.75 }}>{desc}</span>}
        </div>
    );
}