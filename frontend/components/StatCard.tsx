import styles from './StatCard.module.css'

interface StatCardProps {
    label: string
    value: string | number
    unit?: string
}

export default function StatCard({ label, value, unit }: StatCardProps) {
    return (
        <div className={styles.statCard}>
            <div className={styles.label}>{label}</div>
            <div className={styles.valueRow}>
                <span className={styles.value}>{value}</span>
                {unit && <span className={styles.unit}>{unit}</span>}
            </div>
        </div>
    )
}