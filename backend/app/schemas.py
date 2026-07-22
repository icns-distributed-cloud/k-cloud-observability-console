from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel


# ---------- shared ----------
class MetricProfilePoint(BaseModel):
    metric_type: str
    baseline: Decimal
    amplitude: Decimal
    period_sec: int
    unit: str


class AcceleratorGroup(BaseModel):
    node_id: int
    kind: str
    model_name: str
    tflops: Decimal
    memory_gb: Decimal
    memory_type: Optional[str]
    tdp_w: int
    count: int


# ---------- GET /api/v1/providers ----------
class ClusterTreeItem(BaseModel):
    id: int
    name: str
    status: str
    is_live: bool
    cost_per_hour: Decimal
    avg_util: float
    node_count: int


class RegionTree(BaseModel):
    id: int
    name: str
    location: str
    clusters: list[ClusterTreeItem]


class ProviderTree(BaseModel):
    id: int
    name: str
    kind: str
    regions: list[RegionTree]


# ---------- GET /api/v1/clusters ----------
class ClusterListItem(BaseModel):
    id: int
    name: str
    status: str
    is_live: bool
    cost_per_hour: Decimal


# ---------- GET /api/v1/clusters/{cluster_id} ----------
class NodeSummary(BaseModel):
    id: int
    name: str
    cluster_id: int
    metric_profiles: list[MetricProfilePoint]


class ClusterDetail(BaseModel):
    id: int
    name: str
    status: str
    is_live: bool
    cost_per_hour: Decimal
    avg_util: float
    queued_count: int
    running_count: int
    done_count: int
    nodes: list[NodeSummary]
    accelerators: list[AcceleratorGroup]


# ---------- GET /api/v1/clusters/{cluster_id}/metric-profiles ----------
# reuses MetricProfilePoint, response is list[MetricProfilePoint]


# ---------- GET /api/v1/clusters/{cluster_id}/assignments ----------
class AssignmentItem(BaseModel):
    id: int
    job_id: int
    node_id: int
    from_t: datetime
    to_t: Optional[datetime]


# ---------- GET /api/v1/events ----------
class EventItem(BaseModel):
    id: int
    type: str
    job_id: Optional[int]
    node_id: Optional[int]
    accelerator_id: Optional[int]
    cluster_id: Optional[int]
    payload: Optional[dict]
    occurred_at: datetime


# ---------- POST /api/v1/jobs/train ----------
class TrainJobRequest(BaseModel):
    model_id: int
    batch: int
    precision: str
    priority_pref: str


# ---------- POST /api/v1/jobs/infer ----------
class InferJobRequest(BaseModel):
    model_id: int
    batch: int
    precision: str
    priority_pref: str
    sla_target: Decimal


# ---------- GET /api/v1/jobs ----------
class JobSummary(BaseModel):
    id: int
    model_id: int
    model_name: str
    type: str
    status: str
    batch: int
    precision: str
    priority_pref: str
    sla_target: Optional[Decimal]
    submitted_at: datetime
    started_at: Optional[datetime]
    finished_at: Optional[datetime]


# ---------- GET /api/v1/jobs/{job_id} ----------
class JobTrainingProfilePoint(BaseModel):
    metric_name: str
    start_value: Decimal
    target_value: Decimal
    curve_shape: str
    noise_amplitude: Optional[Decimal]


class JobCacheProfilePoint(BaseModel):
    vram_target_pct: Decimal
    vram_transfer_gbps: Decimal
    dram_target_pct: Decimal
    dram_transfer_gbps: Decimal
    ssd_target_pct: Decimal
    ssd_transfer_gbps: Decimal
    hit_rate_target_pct: Decimal
    latency_reduction_pct: Decimal


class JobDetail(JobSummary):
    training_profile: Optional[JobTrainingProfilePoint]
    cache_profile: Optional[JobCacheProfilePoint]


# ---------- GET /api/v1/jobs/{job_id}/reallocations ----------
class ReallocationItem(BaseModel):
    id: int
    donor_job_id: int
    receiver_job_id: int
    node_id: int
    at_t_offset_sec: int
    delta_u_gain: Decimal
    delta_u_loss: Decimal
    downtime_sec: Decimal


# ---------- GET /api/v1/jobs/{job_id}/kqv-allocation ----------
class JobBenchmarkPoint(BaseModel):
    kqv_gain_pct: Optional[Decimal]
    kqv_even_makespan_sec: Optional[Decimal]
    kqv_opt_makespan_sec: Optional[Decimal]


class KqvAllocationItem(BaseModel):
    id: int
    node_id: int
    even_shard: Decimal
    optimized_shard: Decimal


class KqvAllocationResponse(BaseModel):
    benchmark: Optional[JobBenchmarkPoint]
    allocations: list[KqvAllocationItem]


# ---------- GET /api/v1/jobs/{job_id}/hyperparam-adjustment ----------
class HyperparamAdjustmentItem(BaseModel):
    id: int
    seq: int
    t_offset_sec: int
    reward: Decimal
    batch_size: int
    data_shard: int
    workers: int
    lr_multiplier: Decimal
    action: str


# ---------- GET /api/v1/cache-prediction-points ----------
class CachePredictionPointItem(BaseModel):
    id: int
    predicted: Decimal
    actual: Decimal


# ---------- GET /api/v1/models/{model_id}/layers ----------
class ModelLayerItem(BaseModel):
    id: int
    model_id: int
    op_name: str
    shape: str
    gflops: Decimal
    mem_mb: Decimal
    characteristic: str


class ModelLayerEdgeItem(BaseModel):
    id: int
    from_layer_id: int
    to_layer_id: int


class ModelLayersResponse(BaseModel):
    layers: list[ModelLayerItem]
    edges: list[ModelLayerEdgeItem]


# ---------- GET /api/v1/nodes/{node_id} ----------
class NodeDetail(BaseModel):
    id: int
    name: str
    cluster_id: int
    accelerators: list[AcceleratorGroup]
    metric_profiles: list[MetricProfilePoint]


# ---------- GET /api/v1/accelerators/{accelerator_id} ----------
class AcceleratorDetail(BaseModel):
    id: int
    node_id: int
    kind: str
    model_name: str
    tflops: Decimal
    memory_gb: Decimal
    memory_type: Optional[str]
    tdp_w: int
    metric_profiles: list[MetricProfilePoint]
