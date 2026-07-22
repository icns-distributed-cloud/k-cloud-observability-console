import math
import time
from decimal import Decimal

from sqlalchemy.orm import Session, selectinload

from app import clock, models, schemas


def _evaluate(baseline: Decimal, amplitude: Decimal, period_sec: int, now: float | None = None) -> float:
    now = time.time() if now is None else now
    return float(baseline) + float(amplitude) * math.sin(2 * math.pi * now / period_sec)


def _metric_value(profiles: list, metric_type: str) -> float:
    for p in profiles:
        if p.metric_type == metric_type:
            return _evaluate(p.baseline, p.amplitude, p.period_sec)
    return 0.0


def _group_accelerators(accelerators: list) -> list[schemas.AcceleratorGroup]:
    groups: dict[tuple[int, str, str], list] = {}
    for accel in accelerators:
        groups.setdefault((accel.node_id, accel.kind, accel.model_name), []).append(accel)
    return [
        schemas.AcceleratorGroup(
            node_id=accels[0].node_id,
            kind=accels[0].kind,
            model_name=accels[0].model_name,
            tflops=accels[0].tflops,
            memory_gb=accels[0].memory_gb,
            memory_type=accels[0].memory_type,
            tdp_w=accels[0].tdp_w,
            count=len(accels),
        )
        for accels in groups.values()
    ]


def list_providers(db: Session) -> list[schemas.ProviderTree]:
    providers = (
        db.query(models.Provider)
        .options(
            selectinload(models.Provider.regions)
            .selectinload(models.Region.clusters)
            .selectinload(models.Cluster.metric_profiles),
            selectinload(models.Provider.regions)
            .selectinload(models.Region.clusters)
            .selectinload(models.Cluster.nodes),
        )
        .all()
    )
    return [
        schemas.ProviderTree(
            id=provider.id,
            name=provider.name,
            kind=provider.kind,
            regions=[
                schemas.RegionTree(
                    id=region.id,
                    name=region.name,
                    location=region.location,
                    clusters=[
                        schemas.ClusterTreeItem(
                            id=cluster.id,
                            name=cluster.name,
                            status=cluster.status,
                            is_live=cluster.is_live,
                            cost_per_hour=cluster.cost_per_hour,
                            avg_util=_metric_value(cluster.metric_profiles, "utilization"),
                            node_count=len(cluster.nodes),
                        )
                        for cluster in region.clusters
                    ],
                )
                for region in provider.regions
            ],
        )
        for provider in providers
    ]


def _as_metric_points(profiles: list) -> list[schemas.MetricProfilePoint]:
    return [
        schemas.MetricProfilePoint(
            metric_type=p.metric_type,
            baseline=p.baseline,
            amplitude=p.amplitude,
            period_sec=p.period_sec,
            unit=p.unit,
        )
        for p in profiles
    ]


def get_cluster_detail(db: Session, cluster_id: int) -> schemas.ClusterDetail | None:
    cluster = (
        db.query(models.Cluster)
        .options(
            selectinload(models.Cluster.metric_profiles),
            selectinload(models.Cluster.nodes).selectinload(models.Node.accelerators),
            selectinload(models.Cluster.nodes).selectinload(models.Node.metric_profiles),
            selectinload(models.Cluster.nodes).selectinload(models.Node.assignments),
        )
        .filter(models.Cluster.id == cluster_id)
        .first()
    )
    if cluster is None:
        return None

    accelerators = [a for node in cluster.nodes for a in node.accelerators]
    assignments = [a for node in cluster.nodes for a in node.assignments]
    now = clock.now()
    running_job_ids = {
        a.job_id for a in assignments if a.from_t <= now and (a.to_t is None or a.to_t > now)
    }
    done_job_ids = {a.job_id for a in assignments if a.to_t is not None and a.to_t <= now}
    # queued jobs aren't tied to any accelerator yet, so this count is global, not cluster-scoped
    queued_count = db.query(models.Job).filter(models.Job.status == "queued").count()

    return schemas.ClusterDetail(
        id=cluster.id,
        name=cluster.name,
        status=cluster.status,
        is_live=cluster.is_live,
        cost_per_hour=cluster.cost_per_hour,
        avg_util=_metric_value(cluster.metric_profiles, "utilization"),
        queued_count=queued_count,
        running_count=len(running_job_ids),
        done_count=len(done_job_ids),
        nodes=[
            schemas.NodeSummary(
                id=node.id,
                name=node.name,
                cluster_id=cluster.id,
                metric_profiles=_as_metric_points(node.metric_profiles),
            )
            for node in cluster.nodes
        ],
        accelerators=_group_accelerators(accelerators),
    )


def get_cluster_metric_profiles(db: Session, cluster_id: int) -> list[schemas.MetricProfilePoint] | None:
    cluster = (
        db.query(models.Cluster)
        .options(selectinload(models.Cluster.metric_profiles))
        .filter(models.Cluster.id == cluster_id)
        .first()
    )
    if cluster is None:
        return None
    return _as_metric_points(cluster.metric_profiles)


def list_cluster_assignments(db: Session, cluster_id: int) -> list[schemas.AssignmentItem] | None:
    cluster = db.query(models.Cluster).filter(models.Cluster.id == cluster_id).first()
    if cluster is None:
        return None

    assignments = (
        db.query(models.Assignment)
        .join(models.Node, models.Assignment.node_id == models.Node.id)
        .filter(models.Node.cluster_id == cluster_id)
        .all()
    )
    return [
        schemas.AssignmentItem(
            id=a.id,
            job_id=a.job_id,
            node_id=a.node_id,
            from_t=a.from_t,
            to_t=a.to_t,
        )
        for a in assignments
    ]


def get_node_detail(db: Session, node_id: int) -> schemas.NodeDetail | None:
    node = (
        db.query(models.Node)
        .options(selectinload(models.Node.accelerators), selectinload(models.Node.metric_profiles))
        .filter(models.Node.id == node_id)
        .first()
    )
    if node is None:
        return None

    return schemas.NodeDetail(
        id=node.id,
        name=node.name,
        cluster_id=node.cluster_id,
        accelerators=_group_accelerators(node.accelerators),
        metric_profiles=_as_metric_points(node.metric_profiles),
    )


def get_accelerator_detail(db: Session, accelerator_id: int) -> schemas.AcceleratorDetail | None:
    accelerator = (
        db.query(models.Accelerator)
        .options(selectinload(models.Accelerator.metric_profiles))
        .filter(models.Accelerator.id == accelerator_id)
        .first()
    )
    if accelerator is None:
        return None

    return schemas.AcceleratorDetail(
        id=accelerator.id,
        node_id=accelerator.node_id,
        kind=accelerator.kind,
        model_name=accelerator.model_name,
        tflops=accelerator.tflops,
        memory_gb=accelerator.memory_gb,
        memory_type=accelerator.memory_type,
        tdp_w=accelerator.tdp_w,
        metric_profiles=_as_metric_points(accelerator.metric_profiles),
    )
