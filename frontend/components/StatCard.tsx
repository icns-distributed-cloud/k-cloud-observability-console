import styles from './StatCard.module.css'

interface StatCardProps {
    label: string
    value: string | number
    unit?: string
    /** 한 화면에 카드가 많이 몰릴 때(예: 스케줄러 페이지 지표 카드) 쓰는 축소판 */
    compact?: boolean
}

export default function StatCard({ label, value, unit, compact }: StatCardProps) {
    return (
        <div className={`${styles.statCard} ${compact ? styles.compact : ''}`}>
            <div className={styles.label}>{label}</div>
            <div className={styles.valueRow}>
                <span className={styles.value}>{value}</span>
                {unit && <span className={styles.unit}>{unit}</span>}
            </div>
        </div>
    )
}