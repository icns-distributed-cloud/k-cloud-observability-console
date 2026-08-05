"use client";
import { useEffect, useState } from "react";
import Breadcrumb from "@/components/Breadcrumb";
import StatCard from "@/components/StatCard";
import Card from "@/components/Card";
import Tabs from "@/components/Tabs";
import ProgressBar from "@/components/ProgressBar";
import MetricChart from "@/components/MetricChart";
import ModelGraph from "@/components/ModelGraph";
import {
    fetchHyperparamAdjustments,
    fetchJobDetail,
    fetchKqvBenchmark,
    fetchModelLayers,
    fetchReallocations,
} from "@/lib/api";
import { JOB_COLORS, JOB_STATUS_LABELS, PRIORITY_LABELS } from "@/lib/jobs";
import { jobProgress, metricDisplay, metricSeries } from "@/lib/jobMetrics";
import {
    formatMakespan,
    formatOffsetTime,
    sortAdjustments,
    summarizeReallocations,
} from "@/lib/jobOptimize";
import { useTime } from "@/lib/TimeContext";
import type {
    HyperparamAdjustmentItem,
    JobDetail,
    JobKqvBenchmarkResponse,
    ModelLayersResponse,
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

interface Segment {
    label: string;
    onClick?: () => void;
}

interface JobDetailViewProps {
    jobId: number;
    /** 작업명 앞까지의 경로. 작업명 세그먼트는 내부에서 붙인다 */
    breadcrumbPrefix: Segment[];
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
    const [error, setError] = useState<string | null>(null);

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

    if (error) return <main style={{ padding: 24 }}>불러오기 실패: {error}</main>;
    if (!job) return <main style={{ padding: 24 }}>불러오는 중…</main>;

    const color = JOB_COLORS[job.type];
    const progress = now ? jobProgress(job, now) : 0;
    const featured = job.metrics.find((m) => m.featured);
    /** 에포크처럼 총 개수가 있는 지표 — 그래프 하단에 표시하고 카드에서는 뺀다 */
    const counter = job.metrics.find((m) => !m.featured && m.total_count !== null);
    const realloc = summarizeReallocations(reallocs);

    const tabs = [
        { id: "overview", label: "개요" },
        { id: "optimize", label: "최적화" },
    ];

    return (
        <main style={{ padding: "24px 28px" }}>
            <Breadcrumb segments={[...breadcrumbPrefix, { label: job.model_name }]} />

            <div style={{ margin: "16px 0 20px" }}>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{job.model_name}</div>
                <div style={{ fontSize: 12.5, color: "var(--sub)", marginTop: 4 }}>
                    {TYPE_LABELS[job.type] ?? job.type} · {JOB_STATUS_LABELS[job.status] ?? job.status}
                </div>
            </div>

            <Tabs items={tabs} active={tab} onChange={setTab} />

            {tab === "overview" && (
                <div>
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
                        {[...job.metrics]
                            .filter((m) => !m.featured && m.id !== counter?.id)
                            .sort((a, b) => a.seq - b.seq)
                            .map((m) => {
                                const d = metricDisplay(m, progress);
                                return (
                                    <StatCard key={m.id} label={m.label} value={d.value} unit={d.unit ?? undefined} />
                                );
                            })}
                        <StatCard label="배치 크기" value={job.batch} />
                        {job.dataset_name && (
                            <StatCard label="데이터셋" value={job.dataset_name} />
                        )}
                        <StatCard
                            label="우선순위"
                            value={PRIORITY_LABELS[job.priority_pref] ?? job.priority_pref}
                        />
                    </div>

                    <div style={{ marginBottom: 24 }}>
                        <div style={{ ...SECTION_LABEL, marginBottom: 8 }}>진행률</div>
                        <ProgressBar value={progress} color={color} />
                    </div>

                    {featured && now && (
                        <Card>
                            <MetricChart
                                title={`${TYPE_LABELS[job.type] ?? job.type} 현황`}
                                currentLabel={`현재 ${featured.label}`}
                                currentValue={metricDisplay(featured, progress).value}
                                unit={featured.unit}
                                values={metricSeries(featured, progress, 30)}
                                progress={progress}
                                color={color}
                                footerLeft={
                                    counter
                                        ? `${counter.label} ${Math.round(progress * counter.total_count!)} / ${counter.total_count}`
                                        : undefined
                                }
                                xLabel={counter?.label}
                            />
                        </Card>
                    )}

                    {modelLayers && modelLayers.layers.length > 0 && (
                        <>
                            <div style={{ marginTop: 24 }}>
                                <SectionHead title="모델 분석" desc="레이어 → 노드 연산 그래프" />
                            </div>
                            <Card>
                                <ModelGraph layers={modelLayers.layers} edges={modelLayers.edges} />
                            </Card>
                        </>
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

                    {reallocs.length > 0 && (
                        <>
                            <div style={SECTION_LABEL}>무중단 재할당</div>
                            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
                                <StatCard label="자원 변경" value={realloc.count} unit="회" />
                                <StatCard label="중단 시간" value={realloc.downtimeSec} unit="초" />
                                <StatCard label="재개 지연" value={`${realloc.resumeDelaySec}s`} />
                            </div>
                        </>
                    )}

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

                    {!kqv?.kqv_gain_pct &&
                        reallocs.length === 0 &&
                        adjustments.length === 0 &&
                        !job.cache && (
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
                                이 작업에 적용된 최적화 기법이 없습니다.
                            </div>
                        )}
                </div>
            )}

        </main>
    );
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