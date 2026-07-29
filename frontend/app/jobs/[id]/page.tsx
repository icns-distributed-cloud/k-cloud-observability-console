"use client";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Breadcrumb from "@/components/Breadcrumb";
import StatCard from "@/components/StatCard";
import Card from "@/components/Card";
import Tabs from "@/components/Tabs";
import { fetchHyperparamAdjustments, fetchJobDetail, fetchKqvBenchmark, fetchNegotiations, fetchReallocations, } from "@/lib/api";
import { JOB_COLORS, JOB_STATUS_LABELS, PRIORITY_LABELS } from "@/lib/jobs";
import { formatMakespan, formatOffsetTime, sortAdjustments, summarizeReallocations, } from "@/lib/jobOptimize";
import type { HyperparamAdjustmentItem, JobDetail, JobKqvBenchmarkResponse, JobNegotiationResponse, ReallocationItem, } from "@/app/types";
import ProgressBar from "@/components/ProgressBar";
import Sparkline from "@/components/Sparkline";
import { jobProgress, metricDisplay, metricSeries } from "@/lib/jobMetrics";

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
    distributed: "분산학습",
};

export default function JobPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const jobId = Number(id);
    const router = useRouter();

    const [now, setNow] = useState<number | null>(null);
    const [tab, setTab] = useState("overview");
    const [job, setJob] = useState<JobDetail | null>(null);
    const [kqv, setKqv] = useState<JobKqvBenchmarkResponse | null>(null);
    const [reallocs, setReallocs] = useState<ReallocationItem[]>([]);
    const [adjustments, setAdjustments] = useState<HyperparamAdjustmentItem[]>([]);
    const [negotiation, setNegotiation] = useState<JobNegotiationResponse | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setNow(Date.now());
    }, []);

    useEffect(() => {
        Promise.all([
            fetchJobDetail(jobId),
            fetchKqvBenchmark(jobId).catch(() => null),
            fetchReallocations(jobId).catch(() => []),
            fetchHyperparamAdjustments(jobId).catch(() => []),
            fetchNegotiations(jobId).catch(() => null),
        ])
            .then(([j, k, r, a, n]) => {
                setJob(j);
                setKqv(k);
                setReallocs(r);
                setAdjustments(a);
                setNegotiation(n);
            })
            .catch((e) => setError(String(e)));
    }, [jobId]);

    if (error) return <main style={{ padding: 24 }}>불러오기 실패: {error}</main>;
    if (!job) return <main style={{ padding: 24 }}>불러오는 중…</main>;

    const color = JOB_COLORS[job.type];
    const progress = now ? jobProgress(job, now) : 0;
    const featured = job.metrics.find((m) => m.featured);
    const realloc = summarizeReallocations(reallocs);

    const tabs = [
        { id: "overview", label: "개요" },
        { id: "optimize", label: "최적화" },
        ...(job.type === "distributed" ? [{ id: "negotiate", label: "협상" }] : []),
    ];

    return (
        <main style={{ padding: "24px 28px" }}>
            <Breadcrumb
                segments={[
                    { label: "지도", onClick: () => router.push("/") },
                    { label: job.model_name },
                ]}
            />

            <div style={{ margin: "16px 0 20px" }}>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{job.model_name}</div>
                <div style={{ fontSize: 12.5, color: "var(--sub)", marginTop: 4 }}>
                    {TYPE_LABELS[job.type] ?? job.type} ·{" "}
                    {JOB_STATUS_LABELS[job.status] ?? job.status}
                </div>
            </div>

            <Tabs items={tabs} active={tab} onChange={setTab} />

            {tab === "overview" && (
                <div>
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
                        {[...job.metrics]
                            .sort((a, b) => a.seq - b.seq)
                            .map((m) => {
                                const d = metricDisplay(m, progress);
                                return (
                                    <StatCard
                                        key={m.id}
                                        label={m.label}
                                        value={d.value}
                                        unit={d.unit ?? undefined}
                                    />
                                );
                            })}
                        <StatCard label="배치 크기" value={job.batch} />
                        <StatCard label="정밀도" value={job.precision} />
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
                            <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 14 }}>
                                {featured.label}
                                {featured.unit ? ` (${featured.unit})` : ""}
                            </div>
                            <Sparkline
                                label={featured.label}
                                values={metricSeries(featured, progress)}
                                color={color}
                            />
                        </Card>
                    )}
                </div>
            )}

            {tab === "optimize" && (
                <div>
                    {kqv && kqv.kqv_gain_pct !== null && (
                        <>
                            <div style={SECTION_LABEL}>KQV 할당</div>
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

                    {adjustments.length > 0 && (
                        <>
                            <div style={SECTION_LABEL}>하이퍼파라미터 (DART)</div>
                            <Card>
                                <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 12 }}>
                                    보상 신호 기반 하이퍼파라미터 조정 이력
                                </div>
                                {sortAdjustments(adjustments).map((a) => (
                                    <div
                                        key={a.id}
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 16,
                                            padding: "10px 0",
                                            borderTop: "1px solid var(--line)",
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
                                                color: "#34D399",
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

                    {!kqv?.kqv_gain_pct && reallocs.length === 0 && adjustments.length === 0 && (
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

            {tab === "negotiate" && negotiation && (
                <div>
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
                        <StatCard label="협상 라운드" value={negotiation.rounds} />
                        <StatCard
                            label="합의도"
                            value={Number(negotiation.agreement_pct).toFixed(0)}
                            unit="%"
                        />
                    </div>

                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                        <div style={{ flex: 1, minWidth: 260 }}>
                            <Card>
                                <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 10 }}>
                                    CSC 제안 (요구사항)
                                </div>
                                {negotiation.proposed.map((t, i) => (
                                    <div
                                        key={i}
                                        style={{
                                            padding: "8px 0",
                                            borderTop: i > 0 ? "1px solid var(--line)" : "none",
                                            fontSize: 12.5,
                                        }}
                                    >
                                        {t}
                                    </div>
                                ))}
                            </Card>
                        </div>
                        <div style={{ flex: 1, minWidth: 260 }}>
                            <Card>
                                <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 10 }}>
                                    CSP 합의 결과
                                </div>
                                {negotiation.agreed.map((t, i) => (
                                    <div
                                        key={i}
                                        style={{
                                            padding: "8px 0",
                                            borderTop: i > 0 ? "1px solid var(--line)" : "none",
                                            fontSize: 12.5,
                                        }}
                                    >
                                        {t}
                                    </div>
                                ))}
                            </Card>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}