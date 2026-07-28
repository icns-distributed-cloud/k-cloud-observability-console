import type { AssignmentItem, ClusterDetail, JobSummary, MetricProfilePoint, NodeDetail } from '@/app/types'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}/api/v1${path}`)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

export function fetchClusterDetail(clusterId: number) {
  return get<ClusterDetail>(`/clusters/${clusterId}`)
}

export function fetchClusterMetrics(clusterId: number) {
  return get<MetricProfilePoint[]>(`/clusters/${clusterId}/metric-profiles`)
}

export function fetchNodeDetail(nodeId: number) {
  return get<NodeDetail>(`/nodes/${nodeId}`)
}

export function fetchClusterAssignments(clusterId: number) {
  return get<AssignmentItem[]>(`/clusters/${clusterId}/assignments`)
}

export function fetchJobs(status?: string) {
  const query = status ? `?status=${status}` : ''
  return get<JobSummary[]>(`/jobs${query}`)
}