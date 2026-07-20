from decimal import Decimal

from sqlalchemy import ForeignKey
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


class Node(Base):
    __tablename__ = "node"

    id: Mapped[int] = mapped_column(primary_key=True)
    cluster_id: Mapped[int] = mapped_column(ForeignKey("cluster.id"))
    name: Mapped[str]

    cluster: Mapped["Cluster"] = relationship(back_populates="nodes")
    accelerators: Mapped[list["Accelerator"]] = relationship(back_populates="node")
    metric_profiles: Mapped[list["NodeMetricProfile"]] = relationship(back_populates="node")


class Accelerator(Base):
    __tablename__ = "accelerator"

    id: Mapped[int] = mapped_column(primary_key=True)
    node_id: Mapped[int] = mapped_column(ForeignKey("node.id"))
    kind: Mapped[str]
    model_name: Mapped[str]
    tflops: Mapped[Decimal]
    memory_gb: Mapped[Decimal]
    tdp_w: Mapped[int]
    total_capacity: Mapped[Decimal]

    node: Mapped["Node"] = relationship(back_populates="accelerators")
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
