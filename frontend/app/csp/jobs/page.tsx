"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Breadcrumb from "@/components/Breadcrumb";
import JobStatusBoard from "@/components/JobStatusBoard";
import JobTable from "@/components/JobTable";
import { JOB_COLORS } from "@/lib/jobs";

export default function JobListPage() {
    const router = useRouter();
    const [count, setCount] = useState(0);

    return (
        <main style={{ padding: "24px 28px" }}>
            <Breadcrumb
                segments={[
                    { label: "지도", onClick: () => router.push("/csp") },
                    { label: "작업 목록" },
                ]}
            />

            <div
                style={{
                    display: "flex",
                    alignItems: "flex-end",
                    justifyContent: "space-between",
                    margin: "16px 0 20px",
                }}
            >
                <div>
                    <div style={{ fontSize: 20, fontWeight: 700 }}>작업 목록</div>
                    <div style={{ fontSize: 12.5, color: "var(--sub)", marginTop: 4 }}>
                        총 {count}건
                    </div>
                </div>

                <div style={{ display: "flex", gap: 20 }}>
                    <LegendItem color={JOB_COLORS.train} label="학습 작업" />
                    <LegendItem color={JOB_COLORS.infer} label="추론 작업" />
                </div>
            </div>

            {/* CSP는 전체 사용자의 작업을 본다 (userId 미지정) */}
            <JobStatusBoard
                onSelect={(id) => router.push(`/csp/jobs/${id}`)}
                onCountChange={setCount}
            />

            <div style={{ marginTop: 28 }}>
                <JobTable
                    showUser
                    pageSize={20}
                    onSelect={(id) => router.push(`/csp/jobs/${id}`)}
                />
            </div>
        </main>
    );
}

function LegendItem({ color, label }: { color: string; label: string }) {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
                style={{
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    background: color,
                    flexShrink: 0,
                }}
            />
            <span style={{ fontSize: 14, color: "var(--sub)" }}>{label}</span>
        </div>
    );
}