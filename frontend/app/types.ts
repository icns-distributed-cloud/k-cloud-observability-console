// ========== Infra 관련 타입 정의 ==========

export type ClusterStatus = string
export type AcceleratorKind = string
export type ProviderKind = string
export type MetricType = string
export type JobType = string
export type JobStatus = string
export type Precision = string
export type PriorityPref = string
export type EventType = string
export type CurveShape = string

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
    clusters: ClusterTreeItem[]
}

export interface Cluster {
    id: number
    name: string
    status: ClusterStatus
    is_live: boolean
    cost_per_hour: string
}

export interface ClusterTreeItem extends Cluster {
    avg_util: number
    node_count: number
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
    metric_profiles: MetricProfilePoint[]
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

export interface NodeDetail {
    id: number
    name: string
    cluster_id: number
    accelerators: AcceleratorGroup[]
    metric_profiles: MetricProfilePoint[]
}

// ========== Job 관련 타입 정의 ==========
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
    training_profile: JobTrainingProfilePoint | null
}

export interface JobTrainingProfilePoint {
    metric_name: string
    start_value: string
    target_value: string
    curve_shape: CurveShape
    noise_amplitude: string | null
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

// ========== Event 관련 타입 정의 ==========
export interface EventItem {
    id: number
    type: EventType
    job_id: number | null
    node_id: number | null
    accelerator_id: number | null
    cluster_id: number | null
    payload: Record<string, unknown> | null
    occurred_at: string
}