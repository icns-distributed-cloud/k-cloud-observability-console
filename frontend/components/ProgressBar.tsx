import styles from './ProgressBar.module.css'

interface ProgressBarProps {
    value: number
    color?: string
}

export default function ProgressBar({ value, color }: ProgressBarProps) {
    const pct = Math.max(0, Math.min(1, value)) * 100

    return (
        <div className={styles.track}>
            <div
                className={styles.fill}
                style={{ width: `${pct}%`, backgroundColor: color ?? 'var(--accent)' }}
            />
        </div>
    )
}