// ========== 공통 타입 별칭 ==========
export type ProviderKind = 'onprem' | 'cloud'
export type ClusterStatus = 'active' | 'standby'
export type AcceleratorKind = 'GPU' | 'NPU' | 'PIM'
export type AlertSeverity = 'physical' | 'sla'
export type JobType = 'train' | 'infer'
export type JobStatus = 'queued' | 'provisioning' | 'running' | 'finalizing' | 'done'
export type NodePurpose = 'train' | 'infer'
export type PriorityPref = 'time' | 'cost' | 'balanced'
export type CurveShape = 'exp_approach' | 'flat'
export type LayerCharacteristic = 'compute_bound' | 'memory_bound' | 'balanced'
export type EventType = 'ARRIVAL' | 'START' | 'BACKFILL' | 'FINISH'
export type CacheTierName = 'VRAM' | 'DRAM' | 'SSD'
export interface ModelItem {
    id: number
    name: string
    type: string
}
/** 클러스터 간 연결선. 지도에서 곡선으로 그린다 (cluster_link 테이블).
 *  작업 타입 distributed와는 무관하다 — 인프라 간 링크다 */
export interface DistributedLinkItem {
    id: number
    cluster_a_id: number
    cluster_b_id: number
    active: boolean
}
/** 테이블마다 허용값이 다름 (cluster: power/utilization/sla, node: util/cpu/mem/temp, accelerator: util/mem/power) */
export type MetricType =
    | 'power' | 'utilization' | 'sla'
    | 'util' | 'cpu' | 'mem' | 'temp'


// ========== Infra ==========

export interface ProviderTree {
    id: number
    name: string
    kind: ProviderKind
    regions: RegionTree[]
}

export interface RegionTree {
    id: number
    name: string
    location: string
    latitude: string
    longitude: string
    clusters: ClusterTreeItem[]
}

export interface Cluster {
    id: number
    name: string
    status: ClusterStatus
    is_live: boolean
    cost_per_hour: string
}

export type ClusterListItem = Cluster

export interface ClusterTreeItem extends Cluster {
    avg_util: number
    node_count: number
    has_alert: boolean
}

export interface ClusterDetail extends Cluster {
    avg_util: number
    queued_count: number
    running_count: number
    done_count: number
    nodes: NodeSummary[]
    accelerators: AcceleratorGroup[]
}

export interface NodeSummary {
    id: number
    name: string
    cluster_id: number
    purpose: NodePurpose
    metric_profiles: MetricProfilePoint[]
    alerts: NodeAlertItem[]
}

export interface NodeDetail {
    id: number
    name: string
    cluster_id: number
    purpose: NodePurpose
    accelerators: AcceleratorGroup[]
    metric_profiles: MetricProfilePoint[]
    alerts: NodeAlertItem[]
}

export interface NodeAlertItem {
    id: number
    severity: AlertSeverity
    message: string
}

export interface AcceleratorSpec {
    node_id: number
    kind: AcceleratorKind
    model_name: string
    tflops: string
    memory_gb: string
    memory_type: string | null
    tdp_w: number
}

export interface AcceleratorGroup extends AcceleratorSpec {
    count: number
}

export interface AcceleratorDetail extends AcceleratorSpec {
    id: number
    metric_profiles: MetricProfilePoint[]
}

export interface AssignmentItem {
    id: number
    job_id: number
    node_id: number
    from_t: string
    to_t: string | null
}

/** 시계열 데이터가 아니라 파형 생성 파라미터.
 *  값 = baseline + amplitude * sin(2πt / period_sec) 형태로 프론트에서 생성 */
export interface MetricProfilePoint {
    metric_type: MetricType
    baseline: string
    amplitude: string
    period_sec: number
    unit: string
}

// ========== Job ==========

export interface TierRequirementItem {
    kind: AcceleratorKind
    model_name: string | null
    node_count: number
}

/** 작업이 선택한 Tier. 목록 응답에 실려 오므로 별도 조회가 필요 없다 */
export interface SelectedTierSummary {
    id: number
    tier_no: number
    cost_per_hour: string
    requirements: TierRequirementItem[]
}

/** 작업에 배정된 노드. node_id만 주던 assignment와 달리 이름까지 실려 온다 */
export interface AssignedNodeItem {
    node_id: number
    node_name: string
    cluster_id: number
    cluster_name: string
}

export interface JobSummary {
    id: number
    model_id: number
    model_name: string
    user_id: number
    type: JobType
    status: JobStatus
    batch: number
    priority_pref: PriorityPref
    submitted_at: string
    started_at: string | null
    finished_at: string | null
    dataset_id: number | null
    dataset_name: string | null
    selected_tier: SelectedTierSummary | null
    assigned_nodes: AssignedNodeItem[]
    /** 0~1, 현재 단계(provisioning/finalizing/running) 진행률. queued/done이거나
     *  추론 running이면 null (실제 제출은 무기한 실행, 필러도 일관성을 위해 뺌) */
    phase_progress: number | null
}

export interface JobDetail extends JobSummary {
    metrics: JobMetricProfileItem[]
    cache: JobCacheSummary | null
}

/** 작업별 지표 곡선 파라미터.
 *  start_value → target_value 로 curve_shape 형태로 수렴하는 곡선을 프론트에서 생성 */
export interface JobMetricProfileItem {
    id: number
    seq: number
    label: string
    unit: string | null
    start_value: string | null
    target_value: string | null
    curve_shape: CurveShape | null
    total_count: number | null
    featured: boolean
}

export interface JobCacheSummary {
    latency_reduction_pct: string
    tiers: JobCacheTierItem[]
}

export interface JobCacheTierItem {
    id: number
    tier_name: CacheTierName
    fill_pct: string
    latency_ms: string
}

export interface HyperparamAdjustmentItem {
    id: number
    seq: number
    t_offset_sec: number
    param_name: string
    from_value: string
    to_value: string
    reward: string
}

export interface JobKqvBenchmarkResponse {
    kqv_gain_pct: string | null
    kqv_even_makespan_sec: string | null
    kqv_opt_makespan_sec: string | null
}

export interface ReallocationItem {
    id: number
    donor_job_id: number
    receiver_job_id: number
    node_id: number
    at_t_offset_sec: number
    downtime_sec: string
    resume_delay_sec: string
}

export interface TrainJobRequest {
    model_id: number
    batch: number
    priority_pref: PriorityPref
    tier_id: number
    user_id: number
    dataset_id?: number
}

export interface InferJobRequest {
    model_id: number
    batch: number
    priority_pref: PriorityPref
    tier_id: number
    user_id: number
}

// ========== Model ==========

export interface ModelLayerItem {
    id: number
    model_id: number
    op_name: string
    shape: string
    gflops: string
    mem_mb: string
    characteristic: LayerCharacteristic
}

export interface ModelLayerEdgeItem {
    id: number
    from_layer_id: number
    to_layer_id: number
}

export interface ModelLayersResponse {
    layers: ModelLayerItem[]
    edges: ModelLayerEdgeItem[]
}

export interface DatasetItem {
    id: number
    name: string
    model_id: number | null
}

// ========== Resource Tier ==========

export interface ResourceTierItem extends SelectedTierSummary {
    /** 지금 이 구성을 만족하는 유휴 노드가 있는지. 백엔드가 purpose 필터까지 적용해 계산 */
    available: boolean
}

// ========== Event ==========

export interface EventItem {
    id: number
    type: EventType
    job_id: number | null
    node_id: number | null
    cluster_id: number | null
    payload: Record<string, unknown> | null
    occurred_at: string
}