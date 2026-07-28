// ========== 공통 타입 별칭 ==========
export type ProviderKind = 'onprem' | 'cloud'
export type ClusterStatus = 'active' | 'standby'
export type AcceleratorKind = 'GPU' | 'NPU' | 'PIM'
export type AlertSeverity = 'physical' | 'sla'
export type JobType = 'train' | 'infer' | 'distributed'
export type JobStatus = 'queued' | 'running' | 'done'
export type PriorityPref = 'time' | 'cost' | 'balanced'
export type CurveShape = 'exp_approach' | 'flat'
export type LayerCharacteristic = 'compute_bound' | 'memory_bound' | 'balanced'
export type EventType = 'ARRIVAL' | 'START' | 'BACKFILL' | 'FINISH'
export type CacheTierName = 'VRAM' | 'DRAM' | 'SSD'

/** 테이블마다 허용값이 다름 (cluster: power/utilization/sla, node: util/cpu/mem/temp, accelerator: util/mem/power) */
export type MetricType =
    | 'power' | 'utilization' | 'sla'
    | 'util' | 'cpu' | 'mem' | 'temp'


export type Precision = string

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

export interface DistributedLinkItem {
    id: number
    cluster_a_id: number
    cluster_b_id: number
    active: boolean
}

export interface NodeSummary {
    id: number
    name: string
    cluster_id: number
    metric_profiles: MetricProfilePoint[]
    alerts: NodeAlertItem[]
}

export interface NodeDetail {
    id: number
    name: string
    cluster_id: number
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

export interface JobSummary {
    id: number
    model_id: number
    model_name: string
    type: JobType
    status: JobStatus
    batch: number
    precision: Precision
    priority_pref: PriorityPref
    sla_target: string | null
    submitted_at: string
    started_at: string | null
    finished_at: string | null
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

export interface JobNegotiationResponse {
    rounds: number
    agreement_pct: string
    proposed: string[]
    agreed: string[]
}

export interface TrainJobRequest {
    model_id: number
    batch: number
    precision: Precision
    priority_pref: PriorityPref
}

export interface InferJobRequest {
    model_id: number
    batch: number
    precision: Precision
    priority_pref: PriorityPref
    sla_target: number | string
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