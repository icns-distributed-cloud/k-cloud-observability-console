interface ProviderTree {
    id: number
    name: string
    kind: string
    regions: RegionTree[]
}

interface RegionTree {
    id: number
    name: string
    location: string
    clusters: ClusterTreeItem[]
}

interface ClusterTreeItem {
    id: number
    name: string
    status: string
    is_live: boolean
    cost_per_hour: string
    avg_util: number
    node_count: number
}

interface ClusterDetail {
    id: number
    name: string
    status: string
    is_live: boolean
    cost_per_hour: string
    avg_util: number
    queued_count: number
    running_count: number
    done_count: number
    nodes: NodeSummary[]
    accelerators: AcceleratorGroup[]
}

interface NodeSummary {
    id: number
    name: string
    cluster_id: number
metric_profiles: MetricProfilePoint[]
}

interface AcceleratorGroup {
    node_id: number
    kind: string
    model_name: string
    tflops: string
    memory_gb: string
    memory_type: string | null
    tdp_w: number
    count: number
}

interface AcceleratorDetail {
    id: number
    node_id: number
    kind: string
    model_name: string
    tflops: string
    memory_gb: string
    memory_type: string | null
    tdp_w: number
    metric_profiles: MetricProfilePoint[]
}

interface AssignmentItem {
    id: number
    job_id: number
    node_id: number
    from_t: string
    to_t: string | null
}

interface MetricProfilePoint {
    metric_type: string
    baseline: string
    amplitude: string
    period_sec: number
    unit: string

}

interface NodeDetail {
    id: number
    name: string
    cluster_id: number
    accelerators: AcceleratorGroup[]
    metric_profiles: MetricProfilePoint[]
}