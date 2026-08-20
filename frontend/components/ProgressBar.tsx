import styles from './ProgressBar.module.css'

interface ProgressBarProps {
    value: number
    color?: string
    /** 학습 상세 페이지처럼 눈에 더 잘 띄어야 하는 자리에서 쓴다 (기본 8px → 18px) */
    thick?: boolean
}

export default function ProgressBar({ value, color, thick }: ProgressBarProps) {
    const pct = Math.max(0, Math.min(1, value)) * 100

    return (
        <div className={`${styles.track} ${thick ? styles.thick : ''}`}>
            <div
                className={styles.fill}
                style={{ width: `${pct}%`, backgroundColor: color ?? 'var(--accent)' }}
            />
        </div>
    )
}