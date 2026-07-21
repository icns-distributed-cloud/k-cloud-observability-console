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


class ClusterDetail(BaseModel):
    id: int
    name: str
    status: str
    is_live: bool
    cost_per_hour: Decimal
    nodes: list[NodeSummary]
    accelerators: list[AcceleratorGroup]


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
    total_capacity: Decimal
    metric_profiles: list[MetricProfilePoint]
