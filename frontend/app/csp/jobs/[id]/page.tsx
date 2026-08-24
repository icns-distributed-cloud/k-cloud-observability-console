"use client";
import { use } from "react";
import { useRouter } from "next/navigation";
import JobDetailView from "@/components/JobDetailView";

export default function JobFromListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  return (
    <JobDetailView
      jobId={Number(id)}
      breadcrumbPrefix={[
        { label: "가용영역", onClick: () => router.push("/csp") },
        { label: "작업 목록", onClick: () => router.push("/csp/jobs") },
      ]}
    />
  );
}