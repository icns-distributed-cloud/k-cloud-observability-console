"use client";

interface StepperProps {
    steps: string[];
    /** 현재 단계 (0-based) */
    current: number;
}

export default function Stepper({ steps, current }: StepperProps) {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24 }}>
            {steps.map((label, i) => {
                const done = i < current;
                const active = i === current;
                return (
                    <div key={label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span
                                style={{
                                    width: 24,
                                    height: 24,
                                    borderRadius: "50%",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontSize: 12,
                                    fontWeight: 700,
                                    fontFamily: "'IBM Plex Mono', monospace",
                                    flexShrink: 0,
                                    background: active || done ? "var(--accent)" : "var(--panel-2)",
                                    color: active || done ? "#fff" : "var(--sub)",
                                    border: `1px solid ${active || done ? "var(--accent)" : "var(--line)"}`,
                                }}
                            >
                                {done ? "✓" : i + 1}
                            </span>
                            <span
                                style={{
                                    fontSize: 13.5,
                                    fontWeight: active ? 700 : 600,
                                    color: active ? "var(--ink)" : "var(--sub)",
                                }}
                            >
                                {label}
                            </span>
                        </div>
                        {/* 마지막 단계 뒤에는 연결선을 그리지 않는다 */}
                        {i < steps.length - 1 && (
                            <span
                                style={{
                                    width: 32,
                                    height: 1,
                                    background: done ? "var(--accent)" : "var(--line)",
                                }}
                            />
                        )}
                    </div>
                );
            })}
        </div>
    );
}