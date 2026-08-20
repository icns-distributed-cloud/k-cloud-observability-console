interface MetricChartProps {
    /** 카드 좌상단 제목 */
    title: string
    /** 우상단 라벨 (예: "현재 정확도") */
    currentLabel: string
    /** 우상단 값 (예: "67.5") */
    currentValue: string
    unit?: string | null
    /** 시계열 (0 ~ 현재). 오른쪽 미래 구간은 비워둔다 */
    values: number[]
    /** 0~1. 그래프를 가로로 이 비율까지만 그린다 */
    progress: number
    color: string
    /** 좌하단 (예: "에포크 12 / 40") */
    footerLeft?: string
    /** 우하단 X축 라벨 (예: "에포크") */
    xLabel?: string
}

const MONO = "'IBM Plex Mono', monospace"
const PLOT_H = 200
const GUTTER = 44

/** min/max를 덮는 "예쁜" 눈금 count개 (예: 30/45/60/75/90) */
function niceTicks(min: number, max: number, count = 5): number[] {
    const raw = (max - min) / (count - 1) || Math.abs(max) / 10 || 1
    const mag = 10 ** Math.floor(Math.log10(raw))
    for (const m of [1, 2, 2.5, 5, 10, 20]) {
        const step = m * mag
        const lo = Math.floor(min / step) * step
        if (step >= raw && lo + (count - 1) * step >= max) {
            return Array.from({ length: count }, (_, i) => lo + i * step)
        }
    }
    return [min, max]
}

export default function MetricChart({
    title,
    currentLabel,
    currentValue,
    unit,
    values,
    progress,
    color,
    footerLeft,
    xLabel,
}: MetricChartProps) {
    const n = values.length
    if (n === 0) return null

    const ticks = niceTicks(Math.min(...values), Math.max(...values))
    const lo = ticks[0]
    const span = ticks[ticks.length - 1] - lo || 1
    const step = ticks.length > 1 ? ticks[1] - lo : 1
    const dec = step < 1 ? Math.min(3, Math.ceil(-Math.log10(step))) : 0

    const p = Math.max(0, Math.min(1, progress))
    const pts = values.map((v, i) => [
        (n > 1 ? i / (n - 1) : 0) * p * 100,
        100 - ((v - lo) / span) * 100,
    ])
    const line = pts
        .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`)
        .join(' ')
    const [dx, dy] = pts[n - 1]
    const area = `${line} L${dx.toFixed(2)} 100 L0 100 Z`
    const gid = `metricchart-${title.replace(/\W/g, '')}`

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                <div style={{ fontSize: 19, fontWeight: 700 }}>{title}</div>
                <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 14, color: 'var(--sub)' }}>{currentLabel}</div>
                    <div style={{ fontSize: 32, fontWeight: 700, color, fontFamily: MONO, lineHeight: 1.15 }}>
                        {currentValue}
                        {unit && <span style={{ fontSize: 19, marginLeft: 2 }}>{unit}</span>}
                    </div>
                </div>
            </div>

            <div style={{ position: 'relative', height: PLOT_H, marginTop: 18, paddingLeft: GUTTER }}>
                {ticks.map((t, i) => (
                    <div
                        key={i}
                        style={{
                            position: 'absolute',
                            left: 0,
                            right: 0,
                            top: `${100 - ((t - lo) / span) * 100}%`,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            transform: 'translateY(-50%)',
                        }}
                    >
                        <span
                            style={{
                                width: GUTTER - 8,
                                textAlign: 'right',
                                fontSize: 14,
                                lineHeight: 1,
                                color: 'var(--sub)',
                                fontFamily: MONO,
                            }}
                        >
                            {t.toFixed(dec)}
                        </span>
                        <span style={{ flex: 1, borderTop: '1px dashed var(--line)' }} />
                    </div>
                ))}

                <div style={{ position: 'absolute', top: 0, bottom: 0, left: GUTTER, right: 0 }}>
                    <svg
                        viewBox="0 0 100 100"
                        preserveAspectRatio="none"
                        style={{ width: '100%', height: '100%', display: 'block', overflow: 'visible' }}
                    >
                        <defs>
                            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                                <stop offset="100%" stopColor={color} stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <path d={area} fill={`url(#${gid})`} />
                        <path
                            d={line}
                            fill="none"
                            stroke={color}
                            strokeWidth={2}
                            strokeLinejoin="round"
                            strokeLinecap="round"
                            vectorEffect="non-scaling-stroke"
                        />
                    </svg>
                    <span
                        style={{
                            position: 'absolute',
                            left: `${dx}%`,
                            top: `${dy}%`,
                            width: 10,
                            height: 10,
                            marginLeft: -5,
                            marginTop: -5,
                            borderRadius: '50%',
                            background: color,
                            boxShadow: '0 0 0 3px var(--panel)',
                        }}
                    />
                </div>
            </div>

            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: 12,
                    paddingLeft: GUTTER,
                    fontFamily: MONO,
                }}
            >
                <span style={{ fontSize: 17, fontWeight: 700, color: 'var(--ink)' }}>{footerLeft}</span>
                <span style={{ fontSize: 14, color: 'var(--sub)' }}>{xLabel}</span>
            </div>
        </div>
    )
}
