from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Provider(Base):
    __tablename__ = "provider"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str]
    kind: Mapped[str]

    regions: Mapped[list["Region"]] = relationship(back_populates="provider")


class Region(Base):
    __tablename__ = "region"

    id: Mapped[int] = mapped_column(primary_key=True)
    provider_id: Mapped[int] = mapped_column(ForeignKey("provider.id"))
    name: Mapped[str]
    location: Mapped[str]
    latitude: Mapped[Decimal]
    longitude: Mapped[Decimal]

    provider: Mapped["Provider"] = relationship(back_populates="regions")
    clusters: Mapped[list["Cluster"]] = relationship(back_populates="region")


class Cluster(Base):
    __tablename__ = "cluster"

    id: Mapped[int] = mapped_column(primary_key=True)
    region_id: Mapped[int] = mapped_column(ForeignKey("region.id"))
    name: Mapped[str]
    status: Mapped[str]
    is_live: Mapped[bool]
    cost_per_hour: Mapped[Decimal]

    region: Mapped["Region"] = relationship(back_populates="clusters")
    nodes: Mapped[list["Node"]] = relationship(back_populates="cluster")
    metric_profiles: Mapped[list["ClusterMetricProfile"]] = relationship(back_populates="cluster")
    events: Mapped[list["Event"]] = relationship(back_populates="cluster")


class Node(Base):
    __tablename__ = "node"

    id: Mapped[int] = mapped_column(primary_key=True)
    cluster_id: Mapped[int] = mapped_column(ForeignKey("cluster.id"))
    name: Mapped[str]
    purpose: Mapped[str]

    cluster: Mapped["Cluster"] = relationship(back_populates="nodes")
    accelerators: Mapped[list["Accelerator"]] = relationship(back_populates="node")
    metric_profiles: Mapped[list["NodeMetricProfile"]] = relationship(back_populates="node")
    assignments: Mapped[list["Assignment"]] = relationship(back_populates="node")
    events: Mapped[list["Event"]] = relationship(back_populates="node")
    reallocations: Mapped[list["Reallocation"]] = relationship(back_populates="node")
    alerts: Mapped[list["NodeAlert"]] = relationship(back_populates="node")


class AcceleratorModel(Base):
    __tablename__ = "accelerator_model"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str]

    accelerators: Mapped[list["Accelerator"]] = relationship(back_populates="accelerator_model")
    requirements: Mapped[list["ResourceTierRequirement"]] = relationship(back_populates="accelerator_model")


class Accelerator(Base):
    __tablename__ = "accelerator"

    id: Mapped[int] = mapped_column(primary_key=True)
    node_id: Mapped[int] = mapped_column(ForeignKey("node.id"))
    kind: Mapped[str]
    accelerator_model_id: Mapped[int] = mapped_column(ForeignKey("accelerator_model.id"))
    tflops: Mapped[Decimal]
    memory_gb: Mapped[Decimal]
    memory_type: Mapped[Optional[str]]
    tdp_w: Mapped[int]

    node: Mapped["Node"] = relationship(back_populates="accelerators")
    accelerator_model: Mapped["AcceleratorModel"] = relationship(back_populates="accelerators")
    metric_profiles: Mapped[list["AcceleratorMetricProfile"]] = relationship(back_populates="accelerator")


class ClusterMetricProfile(Base):
    __tablename__ = "cluster_metric_profile"

    id: Mapped[int] = mapped_column(primary_key=True)
    cluster_id: Mapped[int] = mapped_column(ForeignKey("cluster.id"))
    metric_type: Mapped[str]
    baseline: Mapped[Decimal]
    amplitude: Mapped[Decimal]
    period_sec: Mapped[int]
    unit: Mapped[str]

    cluster: Mapped["Cluster"] = relationship(back_populates="metric_profiles")


class NodeMetricProfile(Base):
    __tablename__ = "node_metric_profile"

    id: Mapped[int] = mapped_column(primary_key=True)
    node_id: Mapped[int] = mapped_column(ForeignKey("node.id"))
    metric_type: Mapped[str]
    baseline: Mapped[Decimal]
    amplitude: Mapped[Decimal]
    period_sec: Mapped[int]
    unit: Mapped[str]

    node: Mapped["Node"] = relationship(back_populates="metric_profiles")


class AcceleratorMetricProfile(Base):
    __tablename__ = "accelerator_metric_profile"

    id: Mapped[int] = mapped_column(primary_key=True)
    accelerator_id: Mapped[int] = mapped_column(ForeignKey("accelerator.id"))
    metric_type: Mapped[str]
    baseline: Mapped[Decimal]
    amplitude: Mapped[Decimal]
    period_sec: Mapped[int]
    unit: Mapped[str]

    accelerator: Mapped["Accelerator"] = relationship(back_populates="metric_profiles")


class ClusterDistributedLink(Base):
    __tablename__ = "cluster_distributed_link"

    id: Mapped[int] = mapped_column(primary_key=True)
    cluster_a_id: Mapped[int] = mapped_column(ForeignKey("cluster.id"))
    cluster_b_id: Mapped[int] = mapped_column(ForeignKey("cluster.id"))
    active: Mapped[bool]

    cluster_a: Mapped["Cluster"] = relationship(foreign_keys=[cluster_a_id])
    cluster_b: Mapped["Cluster"] = relationship(foreign_keys=[cluster_b_id])


class NodeAlert(Base):
    __tablename__ = "node_alert"

    id: Mapped[int] = mapped_column(primary_key=True)
    node_id: Mapped[int] = mapped_column(ForeignKey("node.id"))
    severity: Mapped[str]
    message: Mapped[str]

    node: Mapped["Node"] = relationship(back_populates="alerts")


class Model(Base):
    __tablename__ = "model"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str]
    type: Mapped[str]

    jobs: Mapped[list["Job"]] = relationship(back_populates="model")
    layers: Mapped[list["ModelLayer"]] = relationship(back_populates="model")
    datasets: Mapped[list["Dataset"]] = relationship(back_populates="model")


class Dataset(Base):
    __tablename__ = "dataset"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str]
    model_id: Mapped[Optional[int]] = mapped_column(ForeignKey("model.id"))

    model: Mapped[Optional["Model"]] = relationship(back_populates="datasets")
    jobs: Mapped[list["Job"]] = relationship(back_populates="dataset")


class ResourceTier(Base):
    __tablename__ = "resource_tier"

    id: Mapped[int] = mapped_column(primary_key=True)
    cluster_id: Mapped[int] = mapped_column(ForeignKey("cluster.id"))
    job_type: Mapped[str]
    tier_no: Mapped[int]
    cost_per_hour: Mapped[Decimal]

    cluster: Mapped["Cluster"] = relationship()
    requirements: Mapped[list["ResourceTierRequirement"]] = relationship(back_populates="tier")
    jobs: Mapped[list["Job"]] = relationship(back_populates="selected_tier")


class ResourceTierRequirement(Base):
    __tablename__ = "resource_tier_requirement"

    id: Mapped[int] = mapped_column(primary_key=True)
    tier_id: Mapped[int] = mapped_column(ForeignKey("resource_tier.id"))
    kind: Mapped[str]
    accelerator_model_id: Mapped[Optional[int]] = mapped_column(ForeignKey("accelerator_model.id"))
    node_count: Mapped[int]

    tier: Mapped["ResourceTier"] = relationship(back_populates="requirements")
    accelerator_model: Mapped[Optional["AcceleratorModel"]] = relationship(back_populates="requirements")


class User(Base):
    __tablename__ = "user"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str]

    jobs: Mapped[list["Job"]] = relationship(back_populates="user")


class Job(Base):
    __tablename__ = "job"

    id: Mapped[int] = mapped_column(primary_key=True)
    model_id: Mapped[int] = mapped_column(ForeignKey("model.id"))
    user_id: Mapped[int] = mapped_column(ForeignKey("user.id"))
    type: Mapped[str]
    status: Mapped[str]
    batch: Mapped[int]
    priority_pref: Mapped[str]
    submitted_at: Mapped[datetime]
    started_at: Mapped[Optional[datetime]]
    finished_at: Mapped[Optional[datetime]]
    dataset_id: Mapped[Optional[int]] = mapped_column(ForeignKey("dataset.id"))
    selected_tier_id: Mapped[Optional[int]] = mapped_column(ForeignKey("resource_tier.id"))

    model: Mapped["Model"] = relationship(back_populates="jobs")
    user: Mapped["User"] = relationship(back_populates="jobs")
    dataset: Mapped[Optional["Dataset"]] = relationship(back_populates="jobs")
    selected_tier: Mapped[Optional["ResourceTier"]] = relationship(back_populates="jobs")
    assignments: Mapped[list["Assignment"]] = relationship(back_populates="job")
    events: Mapped[list["Event"]] = relationship(back_populates="job")
    metric_profiles: Mapped[list["JobMetricProfile"]] = relationship(back_populates="job")
    cache_profile: Mapped[Optional["JobCacheProfile"]] = relationship(back_populates="job")
    cache_tiers: Mapped[list["JobCacheTier"]] = relationship(back_populates="job")
    hyperparam_adjustments: Mapped[list["HyperparamAdjustment"]] = relationship(back_populates="job")
    kqv_benchmark: Mapped[Optional["JobKqvBenchmark"]] = relationship(back_populates="job")
    negotiation: Mapped[Optional["JobNegotiation"]] = relationship(back_populates="job")
    negotiation_items: Mapped[list["JobNegotiationItem"]] = relationship(back_populates="job")


class Assignment(Base):
    __tablename__ = "assignment"

    id: Mapped[int] = mapped_column(primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("job.id"))
    node_id: Mapped[int] = mapped_column(ForeignKey("node.id"))
    from_t: Mapped[datetime]
    to_t: Mapped[Optional[datetime]]

    job: Mapped["Job"] = relationship(back_populates="assignments")
    node: Mapped["Node"] = relationship(back_populates="assignments")


class Event(Base):
    __tablename__ = "event"

    id: Mapped[int] = mapped_column(primary_key=True)
    type: Mapped[str]
    job_id: Mapped[Optional[int]] = mapped_column(ForeignKey("job.id"))
    node_id: Mapped[Optional[int]] = mapped_column(ForeignKey("node.id"))
    cluster_id: Mapped[Optional[int]] = mapped_column(ForeignKey("cluster.id"))
    reallocation_id: Mapped[Optional[int]] = mapped_column(ForeignKey("reallocation.id"))
    payload: Mapped[Optional[dict]] = mapped_column(JSON)
    occurred_at: Mapped[datetime]

    job: Mapped[Optional["Job"]] = relationship(back_populates="events")
    node: Mapped[Optional["Node"]] = relationship(back_populates="events")
    cluster: Mapped[Optional["Cluster"]] = relationship(back_populates="events")
    reallocation: Mapped[Optional["Reallocation"]] = relationship(back_populates="events")


class JobMetricProfile(Base):
    __tablename__ = "job_metric_profile"

    id: Mapped[int] = mapped_column(primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("job.id"))
    seq: Mapped[int]
    label: Mapped[str]
    unit: Mapped[Optional[str]]
    start_value: Mapped[Optional[Decimal]]
    target_value: Mapped[Optional[Decimal]]
    curve_shape: Mapped[Optional[str]]
    total_count: Mapped[Optional[int]]
    featured: Mapped[bool]

    job: Mapped["Job"] = relationship(back_populates="metric_profiles")


class JobCacheProfile(Base):
    __tablename__ = "job_cache_profile"

    job_id: Mapped[int] = mapped_column(ForeignKey("job.id"), primary_key=True)
    latency_reduction_pct: Mapped[Decimal]

    job: Mapped["Job"] = relationship(back_populates="cache_profile")


class JobCacheTier(Base):
    __tablename__ = "job_cache_tier"

    id: Mapped[int] = mapped_column(primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("job.id"))
    tier_name: Mapped[str]
    fill_pct: Mapped[Decimal]
    latency_ms: Mapped[Decimal]

    job: Mapped["Job"] = relationship(back_populates="cache_tiers")


class HyperparamAdjustment(Base):
    __tablename__ = "hyperparam_adjustment"

    id: Mapped[int] = mapped_column(primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("job.id"))
    seq: Mapped[int]
    t_offset_sec: Mapped[int]
    param_name: Mapped[str]
    from_value: Mapped[str]
    to_value: Mapped[str]
    reward: Mapped[str]

    job: Mapped["Job"] = relationship(back_populates="hyperparam_adjustments")


class JobKqvBenchmark(Base):
    __tablename__ = "job_kqv_benchmark"

    job_id: Mapped[int] = mapped_column(ForeignKey("job.id"), primary_key=True)
    kqv_gain_pct: Mapped[Optional[Decimal]]
    kqv_even_makespan_sec: Mapped[Optional[Decimal]]
    kqv_opt_makespan_sec: Mapped[Optional[Decimal]]

    job: Mapped["Job"] = relationship(back_populates="kqv_benchmark")


class Reallocation(Base):
    __tablename__ = "reallocation"

    id: Mapped[int] = mapped_column(primary_key=True)
    donor_job_id: Mapped[int] = mapped_column(ForeignKey("job.id"))
    receiver_job_id: Mapped[int] = mapped_column(ForeignKey("job.id"))
    node_id: Mapped[int] = mapped_column(ForeignKey("node.id"))
    at_t_offset_sec: Mapped[int]
    downtime_sec: Mapped[Decimal]
    resume_delay_sec: Mapped[Decimal]

    donor_job: Mapped["Job"] = relationship(foreign_keys=[donor_job_id])
    receiver_job: Mapped["Job"] = relationship(foreign_keys=[receiver_job_id])
    node: Mapped["Node"] = relationship(back_populates="reallocations")
    events: Mapped[list["Event"]] = relationship(back_populates="reallocation")


class JobNegotiation(Base):
    __tablename__ = "job_negotiation"

    job_id: Mapped[int] = mapped_column(ForeignKey("job.id"), primary_key=True)
    rounds: Mapped[int]
    agreement_pct: Mapped[Decimal]

    job: Mapped["Job"] = relationship(back_populates="negotiation")


class JobNegotiationItem(Base):
    __tablename__ = "job_negotiation_item"

    id: Mapped[int] = mapped_column(primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("job.id"))
    side: Mapped[str]
    seq: Mapped[int]
    text: Mapped[str]

    job: Mapped["Job"] = relationship(back_populates="negotiation_items")


class ModelLayer(Base):
    __tablename__ = "model_layer"

    id: Mapped[int] = mapped_column(primary_key=True)
    model_id: Mapped[int] = mapped_column(ForeignKey("model.id"))
    op_name: Mapped[str]
    shape: Mapped[str]
    gflops: Mapped[Decimal]
    mem_mb: Mapped[Decimal]
    characteristic: Mapped[str]

    model: Mapped["Model"] = relationship(back_populates="layers")


class ModelLayerEdge(Base):
    __tablename__ = "model_layer_edge"

    id: Mapped[int] = mapped_column(primary_key=True)
    from_layer_id: Mapped[int] = mapped_column(ForeignKey("model_layer.id"))
    to_layer_id: Mapped[int] = mapped_column(ForeignKey("model_layer.id"))

    from_layer: Mapped["ModelLayer"] = relationship(foreign_keys=[from_layer_id])
    to_layer: Mapped["ModelLayer"] = relationship(foreign_keys=[to_layer_id])
