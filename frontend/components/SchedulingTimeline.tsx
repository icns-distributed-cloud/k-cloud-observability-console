export interface TimelineSeriesSpec {
    label: string;
    color: string;
    values: number[]; // 이미 0-100 pct 스케일
}

interface SchedulingTimelineProps {
    prefill: TimelineSeriesSpec;
    decode: TimelineSeriesSpec;
    kvVram: TimelineSeriesSpec;
    modelVram: TimelineSeriesSpec;
    kvDram: TimelineSeriesSpec;
    modelDram: TimelineSeriesSpec;
    kvDisk: TimelineSeriesSpec;
    modelDisk: TimelineSeriesSpec;
    ticks: { pos: number; label: string }[];
}

const LABEL_W = 116;
const GUTTER = 34;
const CHART_H = 76;
const MONO = "'IBM Plex Mono', monospace";

const ROW_BOX: React.CSSProperties = {
    border: "1px solid var(--line)",
    borderRadius: 10,
    padding: "10px 14px",
    marginBottom: 10,
};

export default function SchedulingTimeline({
    prefill,
    decode,
    kvVram,
    modelVram,
    kvDram,
    modelDram,
    kvDisk,
    modelDisk,
    ticks,
}: SchedulingTimelineProps) {
    return (
        <div>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>스케줄링 타임라인</div>

            {/* 워크로드(Prefill/Decode) 그룹 - Normalized Backlog Queue, SM Utilization */}
            <LegendGroup title="워크로드" items={[prefill, decode]} />
            <div style={ROW_BOX}>
                <TimelineChartRow rowLabel={["Normalized", "Backlog Queue"]} seriesA={prefill} seriesB={decode} />
            </div>
            <div style={{ ...ROW_BOX, marginBottom: 18 }}>
                <TimelineChartRow rowLabel={["SM", "Utilization"]} seriesA={prefill} seriesB={decode} />
            </div>

            {/* 리소스(KV/Model) 그룹 - VRAM/DRAM/Disk Usage */}
            <LegendGroup title="리소스" items={[kvVram, modelVram]} />
            <div style={ROW_BOX}>
                <TimelineChartRow rowLabel={["VRAM", "Usage"]} seriesA={kvVram} seriesB={modelVram} />
            </div>
            <div style={ROW_BOX}>
                <TimelineChartRow rowLabel={["DRAM", "Usage"]} seriesA={kvDram} seriesB={modelDram} />
            </div>
            <div style={ROW_BOX}>
                <TimelineChartRow rowLabel={["Disk", "Usage"]} seriesA={kvDisk} seriesB={modelDisk} />
            </div>

            {/* 공유 시간축 눈금 */}
            <div style={{ display: "flex", marginTop: 4 }}>
                <span style={{ width: LABEL_W + GUTTER, flexShrink: 0 }} />
                <div style={{ position: "relative", flex: 1, height: 18 }}>
                    {ticks.map((t, i) => (
                        <span
                            key={i}
                            style={{
                                position: "absolute",
                                left: `${t.pos * 100}%`,
                                transform:
                                    i === 0 ? "none" : i === ticks.length - 1 ? "translateX(-100%)" : "translateX(-50%)",
                                fontSize: 12,
                                fontWeight: 600,
                                color: "var(--sub)",
                                fontFamily: MONO,
                            }}
                        >
                            {t.label}
                        </span>
                    ))}
                </div>
            </div>
        </div>
    );
}

function LegendGroup({ title, items }: { title: string; items: TimelineSeriesSpec[] }) {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, fontSize: 12.5 }}>
            <span style={{ color: "var(--sub)", fontWeight: 700 }}>{title}</span>
            {items.map((it) => (
                <span key={it.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: it.color }} />
                    {it.label}
                </span>
            ))}
        </div>
    );
}

/** 고정 0~100 스케일 area+line path. Sparkline/MetricChart와 같은 기법이지만,
 *  이 행들은 값 범위가 매번 달라지는 게 아니라 전부 pct(0-100)라 min/max를 값에서
 *  뽑지 않고 축 자체를 고정한다. */
function buildAreaPath(values: number[]): { line: string; area: string } {
    const n = values.length;
    if (n === 0) return { line: "", area: "" };
    const pts = values.map((v, i) => {
        const x = n > 1 ? (i / (n - 1)) * 100 : 0;
        const y = 100 - Math.max(0, Math.min(100, v));
        return [x, y] as const;
    });
    const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
    const area = `${line} L100 100 L0 100 Z`;
    return { line, area };
}

interface TimelineChartRowProps {
    rowLabel: [string, string];
    seriesA: TimelineSeriesSpec;
    seriesB: TimelineSeriesSpec;
}

function TimelineChartRow({ rowLabel, seriesA, seriesB }: TimelineChartRowProps) {
    const a = buildAreaPath(seriesA.values);
    const b = buildAreaPath(seriesB.values);
    const gidA = `sched-row-${seriesA.label.replace(/\W/g, "")}-a`;
    const gidB = `sched-row-${seriesB.label.replace(/\W/g, "")}-b`;

    return (
        <div style={{ display: "flex" }}>
            <div
                style={{
                    width: LABEL_W,
                    flexShrink: 0,
                    fontSize: 13,
                    fontWeight: 700,
                    color: "var(--sub)",
                    lineHeight: 1.35,
                    paddingRight: 8,
                }}
            >
                {rowLabel[0]}
                <br />
                {rowLabel[1]}
            </div>

            <div style={{ position: "relative", flex: 1, height: CHART_H, paddingLeft: GUTTER }}>
                {[0, 50, 100].map((pct) => (
                    <div
                        key={pct}
                        style={{
                            position: "absolute",
                            left: 0,
                            right: 0,
                            top: `${100 - pct}%`,
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            transform: "translateY(-50%)",
                        }}
                    >
                        <span
                            style={{
                                width: GUTTER - 6,
                                textAlign: "right",
                                fontSize: 11,
                                color: "var(--sub)",
                                fontFamily: MONO,
                            }}
                        >
                            {pct}%
                        </span>
                        <span style={{ flex: 1, borderTop: "1px dashed var(--line)" }} />
                    </div>
                ))}

                <div style={{ position: "absolute", top: 0, bottom: 0, left: GUTTER, right: 0 }}>
                    <svg
                        viewBox="0 0 100 100"
                        preserveAspectRatio="none"
                        style={{ width: "100%", height: "100%", display: "block", overflow: "visible" }}
                    >
                        <defs>
                            <linearGradient id={gidA} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={seriesA.color} stopOpacity={0.35} />
                                <stop offset="100%" stopColor={seriesA.color} stopOpacity={0.05} />
                            </linearGradient>
                            <linearGradient id={gidB} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={seriesB.color} stopOpacity={0.35} />
                                <stop offset="100%" stopColor={seriesB.color} stopOpacity={0.05} />
                            </linearGradient>
                        </defs>
                        {/* 두 영역을 독립적으로 겹쳐 그린다(합이 100%가 되는 진짜 stack이
                            아님 - KPI 카드 수치도 두 값의 합이 100이 아닌 것과 일관되게).
                            어느 구간에서도 한쪽만 그려지는 경우는 없다. */}
                        <path d={a.area} fill={`url(#${gidA})`} />
                        <path d={b.area} fill={`url(#${gidB})`} />
                        <path d={a.line} fill="none" stroke={seriesA.color} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
                        <path d={b.line} fill="none" stroke={seriesB.color} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
                    </svg>
                </div>

                <button
                    disabled
                    aria-label="더보기"
                    style={{
                        position: "absolute",
                        right: -4,
                        top: -2,
                        border: "none",
                        background: "transparent",
                        color: "var(--sub)",
                        fontSize: 14,
                        fontWeight: 700,
                        cursor: "default",
                        opacity: 0.5,
                    }}
                >
                    ···
                </button>
            </div>
        </div>
    );
}
