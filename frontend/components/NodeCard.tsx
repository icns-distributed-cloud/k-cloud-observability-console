import styles from './NodeCard.module.css'
import KindGlyph from './KindGlyph'
import ProgressBar from './ProgressBar'

interface NodeCardProps {
  name: string
  kind: 'GPU' | 'NPU' | 'PIM'
  util: number
  jobName?: string
  jobColor?: string
  hasAlert?: boolean
  onClick?: () => void
}

export default function NodeCard({
  name,
  kind,
  util,
  jobName,
  jobColor,
  hasAlert,
  onClick,
}: NodeCardProps) {
  return (
    <div className={`${styles.card} ${hasAlert ? styles.alert : ''}`} 
    onClick={onClick}
    >
      {hasAlert && <span className={styles.alertDot} />}

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