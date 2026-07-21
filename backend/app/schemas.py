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


class JobDetail(JobSummary):
    training_profile: Optional[JobTrainingProfilePoint]


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
