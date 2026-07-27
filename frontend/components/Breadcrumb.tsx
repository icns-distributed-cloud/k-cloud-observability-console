import styles from './Breadcrumb.module.css'

interface Segment {
  label: string
  onClick?: () => void
}

interface BreadcrumbProps {
  segments: Segment[]
}

export default function Breadcrumb({ segments }: BreadcrumbProps) {
  return (
    <div className={styles.breadcrumb}>
      {segments.map((seg, i) => {
        const isLast = i === segments.length - 1
        return (
          <span key={i} className={styles.item}>
            {i > 0 && <span className={styles.separator}>›</span>}
            <button
              className={isLast ? styles.current : styles.link}
              onClick={seg.onClick}
              disabled={isLast}
            >
              {seg.label}
            </button>
          </span>
        )
      })}
    </div>
  )
}