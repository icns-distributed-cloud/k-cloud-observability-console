import type {
  AssignmentItem,
  ClusterDetail,
  EventItem,
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

/** 작업 상세 "프로파일링" 탭의 이벤트 타임라인용 - job_id로 걸러서 이 작업의
 *  ARRIVAL/QUEUE/BACKFILL(또는 START)/FINISH만 받는다 (since 없이도 전체 이력 조회). */
export function fetchEvents(jobId: number) {
  return get<EventItem[]>(`/events?job_id=${jobId}`)
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

/** 실행 중인 작업 일시중지. 노드는 즉시 반납되어 다른 작업이 쓸 수 있게 된다.
 *  running이 아니면 400 */
export function pauseJob(jobId: number) {
  return post<JobSummary>(`/jobs/${jobId}/pause`, {})
}

/** 일시중지된 작업 재개. 빈 자리가 있으면 running, 없으면 queued로 돌아온다.
 *  paused가 아니면 400 */
export function resumeJob(jobId: number) {
  return post<JobSummary>(`/jobs/${jobId}/resume`, {})
}

/** 작업 종료. running이면 finalizing을 거쳐 다음 sweep에서 done이 되고,
 *  그 외(queued/provisioning/paused)는 바로 done. 이미 done이면 400 */
export function terminateJob(jobId: number) {
  return post<JobSummary>(`/jobs/${jobId}/terminate`, {})
}

export function fetchModels() {
  return get<ModelItem[]>('/models')
}