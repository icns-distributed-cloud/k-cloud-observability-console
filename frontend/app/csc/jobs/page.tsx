"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import JobTable from "@/components/JobTable";
import { CURRENT_USER_ID } from "@/lib/auth";

export default function MyJobsPage() {
    const router = useRouter();
    const [count, setCount] = useState(0);

    return (
        <main style={{ padding: "24px 28px" }}>

            <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 20, fontWeight: 700 }}>내 작업</div>
                <div style={{ fontSize: 12.5, color: "var(--sub)", marginTop: 4 }}>
                    총 {count}건
                </div>
            </div>

            <div style={{ marginBottom: 16 }}>
                <button
                    onClick={() => router.push("/csc/jobs/new")}
                    style={{
                        border: "none",
                        background: "var(--accent)",
                        color: "#fff",
                        borderRadius: 8,
                        padding: "8px 16px",
                        cursor: "pointer",
                        fontFamily: "inherit",
                        fontSize: 12.5,
                        fontWeight: 700,
                    }}
                >
                    + 작업 제출
                </button>
            </div>

            <JobTable
                userId={CURRENT_USER_ID}
                showStop
                onSelect={(id) => router.push(`/csc/jobs/${id}`)}
                onCountChange={setCount}
            />
        </main>
    );
}