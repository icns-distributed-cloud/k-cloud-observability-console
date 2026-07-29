import styles from './NodeCard.module.css'
import KindGlyph from './KindGlyph'
import ProgressBar from './ProgressBar'

const ALERT_COLORS = {
  physical: '#EF4444',
  sla: '#F59E0B',
} as const

const ALERT_SHADOWS = {
  physical: 'rgba(239, 68, 68, 0.25)',
  sla: 'rgba(245, 158, 11, 0.25)',
} as const

interface NodeCardProps {
  name: string
  kind: 'GPU' | 'NPU' | 'PIM'
  util: number
  jobName?: string
  jobColor?: string
  hasAlert?: boolean
  alertSeverity?: 'physical' | 'sla'
  onClick?: () => void
}

export default function NodeCard({
  name,
  kind,
  util,
  jobName,
  jobColor,
  hasAlert,
  alertSeverity = 'physical',
  onClick,
}: NodeCardProps) {
  return (
    <div
      className={styles.card}
      onClick={onClick}
      style={hasAlert ? { borderColor: ALERT_COLORS[alertSeverity] } : undefined}
    >
      {hasAlert && (
        <span
          className={styles.alertDot}
          style={{
            background: ALERT_COLORS[alertSeverity],
            boxShadow: `0 0 0 3px ${ALERT_SHADOWS[alertSeverity]}`,
          }}
        />
      )}

      <div className={styles.header}>
        <KindGlyph kind={kind} size={14} />
        <span className={styles.name}>{name}</span>
        <span className={styles.kind}>{kind}</span>
      </div>

      {jobName ? (
        <div className={styles.jobName} style={{ color: jobColor }}>
          {jobName}
        </div>
      ) : (
        <div className={styles.idle}>유휴</div>
      )}

      <ProgressBar value={util} color={jobColor} />

      <div className={styles.util}>{Math.round(util * 100)}% util</div>
    </div>
  )
}