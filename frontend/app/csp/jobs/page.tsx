"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Breadcrumb from "@/components/Breadcrumb";
import JobTable from "@/components/JobTable";

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

            <div style={{ margin: "16px 0 20px" }}>
                <div style={{ fontSize: 20, fontWeight: 700 }}>작업 목록</div>
                <div style={{ fontSize: 12.5, color: "var(--sub)", marginTop: 4 }}>
                    총 {count}건
                </div>
            </div>

            {/* CSP는 전체 사용자의 작업을 본다 (userId 미지정) */}
            <JobTable
                onSelect={(id) => router.push(`/csp/jobs/${id}`)}
                onCountChange={setCount}
            />
        </main>
    );
}