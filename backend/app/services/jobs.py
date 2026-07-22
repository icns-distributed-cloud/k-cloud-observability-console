from datetime import datetime, timedelta
from decimal import Decimal

from fastapi import Depends
from sqlalchemy.orm import Session, selectinload

from app import clock, models, schemas
from app.database import get_db

DURATION_SEC = {"train": 180, "infer": 30}
REQUIRED_KIND = {"train": "GPU"}  # infer: no kind restriction


def _to_job_summary(job: models.Job) -> schemas.JobSummary:
    return schemas.JobSummary(
        id=job.id,
        model_id=job.model_id,
        model_name=job.model.name,
        type=job.type,
        status=job.status,
        batch=job.batch,
        precision=job.precision,
        priority_pref=job.priority_pref,
        sla_target=job.sla_target,
        submitted_at=job.submitted_at,
        started_at=job.started_at,
        finished_at=job.finished_at,
    )


def _load_live_cluster(db: Session) -> models.Cluster | None:
    return (
        db.query(models.Cluster)
        .options(
            selectinload(models.Cluster.nodes).selectinload(models.Node.accelerators),
            selectinload(models.Cluster.nodes).selectinload(models.Node.assignments),
        )
        .filter(models.Cluster.is_live.is_(True))
        .first()
    )


def _occupied_node_ids(live_cluster: models.Cluster, now: datetime) -> set[int]:
    return {
        a.node_id
        for node in live_cluster.nodes
        for a in node.assignments
        if a.from_t <= now and (a.to_t is None or a.to_t > now)
    }


def _pick_free_node(
    live_cluster: models.Cluster, job_type: str, occupied_node_ids: set[int]
) -> models.Node | None:
    required_kind = REQUIRED_KIND.get(job_type)
    for node in live_cluster.nodes:
        if node.id in occupied_node_ids:
            continue
        if required_kind and not any(a.kind == required_kind for a in node.accelerators):
            continue
        return node
    return None


def _log_event(
    db: Session,
    *,
    type: str,
    now: datetime,
    job_id: int | None = None,
    node_id: int | None = None,
    cluster_id: int | None = None,
) -> None:
    db.add(
        models.Event(
            type=type,
            job_id=job_id,
            node_id=node_id,
            cluster_id=cluster_id,
            occurred_at=now,
        )
    )


def _admit(db: Session, job: models.Job, node: models.Node, now: datetime, event_type: str) -> None:
    db.add(models.Assignment(job_id=job.id, node_id=node.id, from_t=now, to_t=None))
    job.status = "running"
    job.started_at = now
    _log_event(db, type=event_type, now=now, job_id=job.id, node_id=node.id, cluster_id=node.cluster_id)


def sweep_and_backfill(db: Session) -> None:
    now = clock.now()

    running_jobs = (
        db.query(models.Job)
        .filter(models.Job.status == "running")
        .options(selectinload(models.Job.assignments).selectinload(models.Assignment.node))
        .all()
    )
    for job in running_jobs:
        deadline = job.started_at + timedelta(seconds=DURATION_SEC[job.type])
        if deadline <= now:
            job.status = "done"
            job.finished_at = now
            for assignment in job.assignments:
                if assignment.to_t is None:
                    assignment.to_t = now
                    _log_event(
                        db,
                        type="FINISH",
                        now=now,
                        job_id=job.id,
                        node_id=assignment.node_id,
                        cluster_id=assignment.node.cluster_id,
                    )

    live_cluster = _load_live_cluster(db)
    if live_cluster is not None:
        occupied = _occupied_node_ids(live_cluster, now)
        queued_jobs = (
            db.query(models.Job)
            .filter(models.Job.status == "queued")
            .order_by(models.Job.submitted_at)
            .all()
        )
        for job in queued_jobs:
            node = _pick_free_node(live_cluster, job.type, occupied)
            if node is not None:
                _admit(db, job, node, now, event_type="BACKFILL")
                occupied.add(node.id)

    db.commit()


def sweep_dependency(db: Session = Depends(get_db)) -> None:
    sweep_and_backfill(db)


def list_jobs(db: Session, status: str | None = None) -> list[schemas.JobSummary]:
    query = db.query(models.Job).options(selectinload(models.Job.model))
    if status is not None:
        query = query.filter(models.Job.status == status)
    return [_to_job_summary(job) for job in query.all()]


def get_job_detail(db: Session, job_id: int) -> schemas.JobDetail | None:
    job = (
        db.query(models.Job)
        .options(
            selectinload(models.Job.model),
            selectinload(models.Job.training_profile),
            selectinload(models.Job.cache_profile),
        )
        .filter(models.Job.id == job_id)
        .first()
    )
    if job is None:
        return None

    profile = job.training_profile
    training_profile = (
        schemas.JobTrainingProfilePoint(
            metric_name=profile.metric_name,
            start_value=profile.start_value,
            target_value=profile.target_value,
            curve_shape=profile.curve_shape,
            noise_amplitude=profile.noise_amplitude,
        )
        if profile is not None
        else None
    )

    cache = job.cache_profile
    cache_profile = (
        schemas.JobCacheProfilePoint(
            vram_target_pct=cache.vram_target_pct,
            vram_transfer_gbps=cache.vram_transfer_gbps,
            dram_target_pct=cache.dram_target_pct,
            dram_transfer_gbps=cache.dram_transfer_gbps,
            ssd_target_pct=cache.ssd_target_pct,
            ssd_transfer_gbps=cache.ssd_transfer_gbps,
            hit_rate_target_pct=cache.hit_rate_target_pct,
            latency_reduction_pct=cache.latency_reduction_pct,
        )
        if cache is not None
        else None
    )

    return schemas.JobDetail(
        **_to_job_summary(job).model_dump(),
        training_profile=training_profile,
        cache_profile=cache_profile,
    )


def submit_job(
    db: Session,
    *,
    job_type: str,
    model_id: int,
    batch: int,
    precision: str,
    priority_pref: str,
    sla_target: Decimal | None,
) -> schemas.JobSummary:
    now = clock.now()
    job = models.Job(
        model_id=model_id,
        type=job_type,
        status="queued",
        batch=batch,
        precision=precision,
        priority_pref=priority_pref,
        sla_target=sla_target,
        submitted_at=now,
    )
    db.add(job)
    db.flush()
    _log_event(db, type="ARRIVAL", now=now, job_id=job.id)

    live_cluster = _load_live_cluster(db)
    if live_cluster is not None:
        occupied = _occupied_node_ids(live_cluster, now)
        node = _pick_free_node(live_cluster, job.type, occupied)
        if node is not None:
            _admit(db, job, node, now, event_type="START")

    db.commit()
    db.refresh(job)
    return _to_job_summary(job)
