"use client";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import JobDetailView from "@/components/JobDetailView";
import { fetchClusterDetail, fetchNodeDetail } from "@/lib/api";

export default function JobPage({
  params,
}: {
  params: Promise<{ id: string; nodeId: string; jobId: string }>;
}) {
  const { id, nodeId, jobId } = use(params);
  const clusterId = Number(id);
  const nodeIdNum = Number(nodeId);
  const router = useRouter();

  const [clusterName, setClusterName] = useState(`클러스터 ${clusterId}`);
  const [nodeName, setNodeName] = useState(`노드 ${nodeIdNum}`);

  useEffect(() => {
    fetchClusterDetail(clusterId)
      .then((c) => setClusterName(c.name))
      .catch(() => {});
    fetchNodeDetail(nodeIdNum)
      .then((n) => setNodeName(n.name))
      .catch(() => {});
  }, [clusterId, nodeIdNum]);

  return (
    <JobDetailView
      jobId={Number(jobId)}
      breadcrumbPrefix={[
        { label: "가용영역", onClick: () => router.push("/csp") },
        { label: clusterName, onClick: () => router.push(`/csp/clusters/${clusterId}`) },
        { label: nodeName, onClick: () => router.push(`/csp/nodes/${nodeIdNum}`) },
      ]}
    />
  );
}