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
        { label: "지도", onClick: () => router.push("/") },
        { label: "작업 목록", onClick: () => router.push("/jobs") },
      ]}
    />
  );
}