"use client";
import { use } from "react";
import { useRouter } from "next/navigation";
import JobDetailView from "@/components/JobDetailView";

export default function MyJobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  return (
    <JobDetailView
      jobId={Number(id)}
      breadcrumbPrefix={[{ label: "내 작업", onClick: () => router.push("/csc/jobs") }]}
      showStop
    />
  );
}