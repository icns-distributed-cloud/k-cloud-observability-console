import styles from "./BarChart.module.css";

interface BarChartProps {
  values: number[];
  label: string;
  color?: string;
}

export default function BarChart({ values, label, color = "var(--accent)" }: BarChartProps) {
  if (values.length === 0) return null;

  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;

  return (
    <div>
      <div className={styles.label}>{label}</div>
      <div className={styles.bars}>
        {values.map((v, i) => {
          const isLast = i === values.length - 1;
          // 최소값도 막대가 보이도록 30% 바닥을 깔고 나머지를 값에 비례시킴
          const heightPct = 30 + ((v - min) / span) * 70;
          return (
            <div
              key={i}
              className={styles.bar}
              style={{
                height: `${heightPct}%`,
                background: color,
                opacity: isLast ? 1 : 0.45,
              }}
              title={v.toFixed(1)}
            />
          );
        })}
      </div>
    </div>
  );
}