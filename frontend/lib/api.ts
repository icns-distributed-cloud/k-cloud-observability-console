import type {
  AssignmentItem,
  ClusterDetail,
  DistributedLinkItem,
  HyperparamAdjustmentItem,
  JobDetail,
  JobKqvBenchmarkResponse,
  JobNegotiationResponse,
  JobSummary,
  MetricProfilePoint,
  ModelLayersResponse,
  NodeDetail,
  ProviderTree,
  ReallocationItem,
} from '@/app/types'

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

export function fetchJobDetail(jobId: number) {
  return get<JobDetail>(`/jobs/${jobId}`)
}

export function fetchHyperparamAdjustments(jobId: number) {
  return get<HyperparamAdjustmentItem[]>(`/jobs/${jobId}/hyperparam-adjustment`)
}

export function fetchKqvBenchmark(jobId: number) {
  return get<JobKqvBenchmarkResponse>(`/jobs/${jobId}/kqv-benchmark`)
}

export function fetchReallocations(jobId: number) {
  return get<ReallocationItem[]>(`/jobs/${jobId}/reallocations`)
}

export function fetchNegotiations(jobId: number) {
  return get<JobNegotiationResponse>(`/jobs/${jobId}/negotiations`)
}

export function fetchModelLayers(modelId: number) {
  return get<ModelLayersResponse>(`/models/${modelId}/layers`)
}

export function fetchProviders() {
  return get<ProviderTree[]>('/providers')
}

export function fetchDistributedLinks() {
  return get<DistributedLinkItem[]>('/distributed-links')
}