import styles from './NodeCard.module.css'
import ProgressBar from './ProgressBar'

const ALERT_COLORS = {
  physical: 'var(--alert-critical)',
  sla: 'var(--alert-warning)',
} as const

const ALERT_SHADOWS = {
  physical: 'rgba(220, 38, 38, 0.2)',
  sla: 'rgba(217, 119, 6, 0.2)',
} as const

interface NodeCardProps {
  name: string
  util: number
  jobName?: string
  jobColor?: string
  hasAlert?: boolean
  alertSeverity?: 'physical' | 'sla'
  onClick?: () => void
}

export default function NodeCard({
  name,
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
        <span className={styles.name}>{name}</span>
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