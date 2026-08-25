import styles from './Sparkline.module.css'

interface SparklineProps {
  values: number[]
  label: string
  color?: string
  /** 그래프 대신 큰 숫자만 보여준다 - 값 하나가 특히 더 잘 보여야 할 때(예: SLO 위반
   *  횟수)도, 같은 줄의 다른 스파크라인 카드와 같은 폭·높이를 유지하려고 이 컴포넌트를
   *  그대로 쓴다. */
  numberOnly?: boolean
}

const W = 100
const H = 32

export default function Sparkline({ values, label, color = 'var(--accent)', numberOnly }: SparklineProps) {
  if (values.length === 0) return null

  const n = values.length
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1

  const points = values.map((v, i) => {
    const x = n > 1 ? (i / (n - 1)) * W : 0
    const y = H - ((v - min) / span) * (H - 6) - 3
    return [x, y] as const
  })

  const line = points
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(' ')

  const area = `${line} L${W} ${H} L0 ${H} Z`

  const gradientId = `sparkline-${label.replace(/\W/g, '')}`
  const current = values[n - 1]

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <span className={styles.label}>{label}</span>
        {!numberOnly && <span className={styles.value}>{current.toFixed(1)}</span>}
      </div>

      {numberOnly ? (
        <div className={styles.bigValue} style={{ color }}>
          {Number.isInteger(current) ? current : current.toFixed(1)}
        </div>
      ) : (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className={styles.svg}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${gradientId})`} />
          <path
            d={line}
            fill="none"
            stroke={color}
            strokeWidth={1.4}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      )}
    </div>
  )
}