import type {
  AssignmentItem,
  ClusterDetail,
  HyperparamAdjustmentItem,
  JobDetail,
  JobKqvBenchmarkResponse,
  JobSummary,
  MetricProfilePoint,
  ModelLayersResponse,
  NodeDetail,
  ProviderTree,
  ReallocationItem,
  InferJobRequest,
  TrainJobRequest,
  ModelItem,
  DatasetItem,
  ResourceTierItem,
  DistributedLinkItem,
  PriorityPref,
} from '@/app/types'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}/api/v1${path}`)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}/api/v1${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
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

export function fetchJobs(params?: {
  status?: string
  userId?: number
  /** 주면 커서 기반 페이지네이션 모드 - beforeId보다 오래된(id가 작은) 것들 중
   *  limit+1개를 받는다 (마지막 한 개는 "다음 페이지 있음" 판단용, 응답 형태는
   *  그대로 JobSummary[]라 페이지네이션 안 쓰는 호출과 스키마가 동일하다). */
  limit?: number
  beforeId?: number
}) {
  const q = new URLSearchParams()
  if (params?.status) q.set('status', params.status)
  if (params?.userId !== undefined) q.set('user_id', String(params.userId))
  if (params?.limit !== undefined) q.set('limit', String(params.limit))
  if (params?.beforeId !== undefined) q.set('before_id', String(params.beforeId))
  const query = q.toString()
  return get<JobSummary[]>(`/jobs${query ? `?${query}` : ''}`)
}

export function fetchResourceTiers(jobType: 'train' | 'infer', priorityPref?: PriorityPref) {
  const q = new URLSearchParams({ job_type: jobType })
  if (priorityPref) q.set('priority_pref', priorityPref)
  return get<ResourceTierItem[]>(`/resource-tiers?${q}`)
}

/** 모델을 고르면 그 모델용 데이터셋 목록을 받아 드롭다운을 채운다 */
export function fetchDatasets(modelId?: number) {
  const query = modelId === undefined ? '' : `?model_id=${modelId}`
  return get<DatasetItem[]>(`/datasets${query}`)
}

export function fetchJobDetail(jobId: number) {
  return get<JobDetail>(`/jobs/${jobId}`)
}

export function fetchJobAssignments(jobId: number) {
  return get<AssignmentItem[]>(`/jobs/${jobId}/assignments`)
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

export function fetchModelLayers(modelId: number) {
  return get<ModelLayersResponse>(`/models/${modelId}/layers`)
}

export function fetchProviders() {
  return get<ProviderTree[]>('/providers')
}

export function submitTrainJob(body: TrainJobRequest) {
  return post<JobSummary>('/jobs/train', body)
}

export function fetchDistributedLinks() {
  return get<DistributedLinkItem[]>('/distributed-links')
}

export function submitInferJob(body: InferJobRequest) {
  return post<JobSummary>('/jobs/infer', body)
}

/** 추론 작업 중단. 응답으로 finalizing 상태가 된 작업이 돌아온다 (곧바로 done이 아니라
 *  마무리 단계를 거친 뒤 다음 sweep에서 done으로 넘어가며 노드가 반납된다).
 *  infer가 아니거나 running이 아니면 400 */
export function stopJob(jobId: number) {
  return post<JobSummary>(`/jobs/${jobId}/stop`, {})
}

export function fetchModels() {
  return get<ModelItem[]>('/models')
}