from datetime import datetime, timedelta
from decimal import Decimal

from sqlalchemy.orm import Session, selectinload

from app import models, schemas

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


def _admit(db: Session, job: models.Job, node: models.Node, now: datetime) -> None:
    db.add(models.Assignment(job_id=job.id, node_id=node.id, from_t=now, to_t=None))
    job.status = "running"
    job.started_at = now


def sweep_and_backfill(db: Session) -> None:
    now = datetime.utcnow()

    running_jobs = db.query(models.Job).filter(models.Job.status == "running").all()
    for job in running_jobs:
        deadline = job.started_at + timedelta(seconds=DURATION_SEC[job.type])
        if deadline <= now:
            job.status = "done"
            job.finished_at = now
            for assignment in job.assignments:
                if assignment.to_t is None:
                    assignment.to_t = now

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
                _admit(db, job, node, now)
                occupied.add(node.id)

    db.commit()


def sweep_dependency(db: Session) -> None:
    sweep_and_backfill(db)


def list_jobs(db: Session, status: str | None = None) -> list[schemas.JobSummary]:
    query = db.query(models.Job).options(selectinload(models.Job.model))
    if status is not None:
        query = query.filter(models.Job.status == status)
    return [_to_job_summary(job) for job in query.all()]


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
    now = datetime.utcnow()
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

    live_cluster = _load_live_cluster(db)
    if live_cluster is not None:
        occupied = _occupied_node_ids(live_cluster, now)
        node = _pick_free_node(live_cluster, job.type, occupied)
        if node is not None:
            _admit(db, job, node, now)

    db.commit()
    db.refresh(job)
    return _to_job_summary(job)
