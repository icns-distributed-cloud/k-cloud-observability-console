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

    cluster: Mapped["Cluster"] = relationship(back_populates="nodes")
    accelerators: Mapped[list["Accelerator"]] = relationship(back_populates="node")
    metric_profiles: Mapped[list["NodeMetricProfile"]] = relationship(back_populates="node")
    assignments: Mapped[list["Assignment"]] = relationship(back_populates="node")
    events: Mapped[list["Event"]] = relationship(back_populates="node")
    kqv_allocations: Mapped[list["KqvAllocation"]] = relationship(back_populates="node")
    reallocations: Mapped[list["Reallocation"]] = relationship(back_populates="node")


class Accelerator(Base):
    __tablename__ = "accelerator"

    id: Mapped[int] = mapped_column(primary_key=True)
    node_id: Mapped[int] = mapped_column(ForeignKey("node.id"))
    kind: Mapped[str]
    model_name: Mapped[str]
    tflops: Mapped[Decimal]
    memory_gb: Mapped[Decimal]
    memory_type: Mapped[Optional[str]]
    tdp_w: Mapped[int]

    node: Mapped["Node"] = relationship(back_populates="accelerators")
    metric_profiles: Mapped[list["AcceleratorMetricProfile"]] = relationship(back_populates="accelerator")
    events: Mapped[list["Event"]] = relationship(back_populates="accelerator")


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


class Model(Base):
    __tablename__ = "model"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str]
    type: Mapped[str]

    jobs: Mapped[list["Job"]] = relationship(back_populates="model")
    layers: Mapped[list["ModelLayer"]] = relationship(back_populates="model")


class Job(Base):
    __tablename__ = "job"

    id: Mapped[int] = mapped_column(primary_key=True)
    model_id: Mapped[int] = mapped_column(ForeignKey("model.id"))
    type: Mapped[str]
    status: Mapped[str]
    batch: Mapped[int]
    precision: Mapped[str]
    priority_pref: Mapped[str]
    sla_target: Mapped[Optional[Decimal]]
    submitted_at: Mapped[datetime]
    started_at: Mapped[Optional[datetime]]
    finished_at: Mapped[Optional[datetime]]

    model: Mapped["Model"] = relationship(back_populates="jobs")
    assignments: Mapped[list["Assignment"]] = relationship(back_populates="job")
    events: Mapped[list["Event"]] = relationship(back_populates="job")
    training_profile: Mapped[Optional["JobTrainingProfile"]] = relationship(back_populates="job")
    cache_profile: Mapped[Optional["JobCacheProfile"]] = relationship(back_populates="job")
    hyperparam_adjustments: Mapped[list["HyperparamAdjustment"]] = relationship(back_populates="job")
    benchmark: Mapped[Optional["JobBenchmark"]] = relationship(back_populates="job")
    kqv_allocations: Mapped[list["KqvAllocation"]] = relationship(back_populates="job")


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
    accelerator_id: Mapped[Optional[int]] = mapped_column(ForeignKey("accelerator.id"))
    cluster_id: Mapped[Optional[int]] = mapped_column(ForeignKey("cluster.id"))
    reallocation_id: Mapped[Optional[int]] = mapped_column(ForeignKey("reallocation.id"))
    payload: Mapped[Optional[dict]] = mapped_column(JSON)
    occurred_at: Mapped[datetime]

    job: Mapped[Optional["Job"]] = relationship(back_populates="events")
    node: Mapped[Optional["Node"]] = relationship(back_populates="events")
    accelerator: Mapped[Optional["Accelerator"]] = relationship(back_populates="events")
    cluster: Mapped[Optional["Cluster"]] = relationship(back_populates="events")
    reallocation: Mapped[Optional["Reallocation"]] = relationship(back_populates="events")


class JobTrainingProfile(Base):
    __tablename__ = "job_training_profile"

    job_id: Mapped[int] = mapped_column(ForeignKey("job.id"), primary_key=True)
    metric_name: Mapped[str]
    start_value: Mapped[Decimal]
    target_value: Mapped[Decimal]
    curve_shape: Mapped[str]
    noise_amplitude: Mapped[Optional[Decimal]]

    job: Mapped["Job"] = relationship(back_populates="training_profile")


class JobCacheProfile(Base):
    __tablename__ = "job_cache_profile"

    job_id: Mapped[int] = mapped_column(ForeignKey("job.id"), primary_key=True)
    vram_target_pct: Mapped[Decimal]
    vram_transfer_gbps: Mapped[Decimal]
    dram_target_pct: Mapped[Decimal]
    dram_transfer_gbps: Mapped[Decimal]
    ssd_target_pct: Mapped[Decimal]
    ssd_transfer_gbps: Mapped[Decimal]
    hit_rate_target_pct: Mapped[Decimal]
    latency_reduction_pct: Mapped[Decimal]

    job: Mapped["Job"] = relationship(back_populates="cache_profile")


class HyperparamAdjustment(Base):
    __tablename__ = "hyperparam_adjustment"

    id: Mapped[int] = mapped_column(primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("job.id"))
    seq: Mapped[int]
    t_offset_sec: Mapped[int]
    reward: Mapped[Decimal]
    batch_size: Mapped[int]
    data_shard: Mapped[int]
    workers: Mapped[int]
    lr_multiplier: Mapped[Decimal]
    action: Mapped[str]

    job: Mapped["Job"] = relationship(back_populates="hyperparam_adjustments")


class CachePredictionPoint(Base):
    __tablename__ = "cache_prediction_point"

    id: Mapped[int] = mapped_column(primary_key=True)
    predicted: Mapped[Decimal]
    actual: Mapped[Decimal]


class JobBenchmark(Base):
    __tablename__ = "job_benchmark"

    job_id: Mapped[int] = mapped_column(ForeignKey("job.id"), primary_key=True)
    kqv_gain_pct: Mapped[Optional[Decimal]]
    kqv_even_makespan_sec: Mapped[Optional[Decimal]]
    kqv_opt_makespan_sec: Mapped[Optional[Decimal]]

    job: Mapped["Job"] = relationship(back_populates="benchmark")


class KqvAllocation(Base):
    __tablename__ = "kqv_allocation"

    id: Mapped[int] = mapped_column(primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("job.id"))
    node_id: Mapped[int] = mapped_column(ForeignKey("node.id"))
    even_shard: Mapped[Decimal]
    optimized_shard: Mapped[Decimal]

    job: Mapped["Job"] = relationship(back_populates="kqv_allocations")
    node: Mapped["Node"] = relationship(back_populates="kqv_allocations")


class Reallocation(Base):
    __tablename__ = "reallocation"

    id: Mapped[int] = mapped_column(primary_key=True)
    donor_job_id: Mapped[int] = mapped_column(ForeignKey("job.id"))
    receiver_job_id: Mapped[int] = mapped_column(ForeignKey("job.id"))
    node_id: Mapped[int] = mapped_column(ForeignKey("node.id"))
    at_t_offset_sec: Mapped[int]
    delta_u_gain: Mapped[Decimal]
    delta_u_loss: Mapped[Decimal]
    downtime_sec: Mapped[Decimal]

    donor_job: Mapped["Job"] = relationship(foreign_keys=[donor_job_id])
    receiver_job: Mapped["Job"] = relationship(foreign_keys=[receiver_job_id])
    node: Mapped["Node"] = relationship(back_populates="reallocations")
    events: Mapped[list["Event"]] = relationship(back_populates="reallocation")


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
