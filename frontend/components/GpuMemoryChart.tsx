import { generateAllocatedTrace, niceTicks, formatMb } from "@/lib/gpuMemory";

interface GpuMemoryChartProps {
    peakMb: number;
    troughMb: number;
    reservedMb: number;
    /** model_id처럼 모델마다 다른 값 - 항상 같은 모델은 항상 같은 트레이스가
     *  나오게 하는 결정론적 시드 */
    seed: number;
}

const MONO = "'Pretendard', monospace";
const PLOT_H = 220;
const GUTTER = 56;
const X_AXIS_H = 22;
const ALLOCATED_COLOR = "#3B82F6"; // PyTorch Profiler Memory View의 Allocated 파란색
const RESERVED_COLOR = "#EA580C"; // Reserved 주황/빨강
/** x축은 실제 wall-clock이 아니라 장식용 눈금(스텝 진행을 ms처럼 보이게) -
 *  모델 구조 기반 예측치라 진짜 시간과 결부시킬 수 없어서, 참고 이미지와 비슷한
 *  스케일감만 내는 임의의 총 구간이다. */
const DISPLAY_SPAN_MS = 420;

export default function GpuMemoryChart({ peakMb, troughMb, reservedMb, seed }: GpuMemoryChartProps) {
    const allocated = generateAllocatedTrace(peakMb, troughMb, seed);
    const n = allocated.length;
    const ticks = niceTicks(0, reservedMb * 1.1);
    const maxVal = ticks[ticks.length - 1];
    const dec = ticks[1] - ticks[0] < 1 ? 1 : 0;

    const pts = allocated.map((v, i) => [
        n > 1 ? (i / (n - 1)) * 100 : 0,
        100 - (v / maxVal) * 100,
    ]);
    const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
    const area = `${line} L100 100 L0 100 Z`;
    const reservedY = 100 - (reservedMb / maxVal) * 100;
    const gid = "gpu-memory-allocated";

    const xTicks = Array.from({ length: 7 }, (_, i) => Math.round((DISPLAY_SPAN_MS / 6) * i));

    return (
        <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>
                Peak Memory Usage: {formatMb(peakMb)}
            </div>

            <div style={{ display: "flex", position: "relative", marginTop: 16 }}>
                {/* Y축 제목 */}
                <div
                    style={{
                        writingMode: "vertical-rl",
                        transform: "rotate(180deg)",
                        fontSize: 12.5,
                        color: "var(--sub)",
                        fontStyle: "italic",
                        marginRight: 6,
                        flexShrink: 0,
                    }}
                >
                    Memory Usage (MB)
                </div>

                <div style={{ flex: 1 }}>
                    <div style={{ position: "relative", height: PLOT_H, paddingLeft: GUTTER }}>
                        {ticks.map((t) => (
                            <div
                                key={t}
                                style={{
                                    position: "absolute",
                                    left: 0,
                                    right: 0,
                                    top: `${100 - (t / maxVal) * 100}%`,
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                    transform: "translateY(-50%)",
                                }}
                            >
                                <span
                                    style={{
                                        width: GUTTER - 8,
                                        textAlign: "right",
                                        fontSize: 12.5,
                                        lineHeight: 1,
                                        color: "var(--sub)",
                                        fontFamily: MONO,
                                    }}
                                >
                                    {t.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec })}
                                </span>
                                <span style={{ flex: 1, borderTop: "1px solid var(--line)" }} />
                            </div>
                        ))}

                        <div style={{ position: "absolute", top: 0, bottom: 0, left: GUTTER, right: 0 }}>
                            <svg
                                viewBox="0 0 100 100"
                                preserveAspectRatio="none"
                                style={{ width: "100%", height: "100%", display: "block", overflow: "visible" }}
                            >
                                <defs>
                                    <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor={ALLOCATED_COLOR} stopOpacity={0.22} />
                                        <stop offset="100%" stopColor={ALLOCATED_COLOR} stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <path d={area} fill={`url(#${gid})`} />
                                <path
                                    d={line}
                                    fill="none"
                                    stroke={ALLOCATED_COLOR}
                                    strokeWidth={1.6}
                                    strokeLinejoin="round"
                                    strokeLinecap="round"
                                    vectorEffect="non-scaling-stroke"
                                />
                                <path
                                    d={`M0 ${reservedY.toFixed(2)} L100 ${reservedY.toFixed(2)}`}
                                    fill="none"
                                    stroke={RESERVED_COLOR}
                                    strokeWidth={1.8}
                                    vectorEffect="non-scaling-stroke"
                                />
                            </svg>
                        </div>
                    </div>

                    {/* X축 눈금 */}
                    <div style={{ position: "relative", height: X_AXIS_H, paddingLeft: GUTTER }}>
                        {xTicks.map((t, i) => (
                            <span
                                key={t}
                                style={{
                                    position: "absolute",
                                    left: `${(i / (xTicks.length - 1)) * 100}%`,
                                    transform:
                                        i === 0 ? "none" : i === xTicks.length - 1 ? "translateX(-100%)" : "translateX(-50%)",
                                    fontSize: 12,
                                    color: "var(--sub)",
                                    fontFamily: MONO,
                                }}
                            >
                                {t}
                            </span>
                        ))}
                    </div>
                    <div style={{ textAlign: "center", fontSize: 12.5, color: "var(--sub)", fontStyle: "italic", marginTop: 2 }}>
                        Time (ms)
                    </div>
                </div>
            </div>

            {/* 범례 */}
            <div style={{ display: "flex", justifyContent: "center", gap: 24, marginTop: 12, fontSize: 12.5 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 16, borderTop: `2.5px solid ${ALLOCATED_COLOR}` }} />
                    Allocated (MB)
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 16, borderTop: `2.5px solid ${RESERVED_COLOR}` }} />
                    Reserved (MB)
                </span>
            </div>

        </div>
    );
}
