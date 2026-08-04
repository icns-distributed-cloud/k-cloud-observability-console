from datetime import datetime, timedelta
from decimal import Decimal

from fastapi import Depends
from sqlalchemy import or_
from sqlalchemy.orm import Session, selectinload

from app import clock, models, schemas
from app.database import get_db

DURATION_SEC = {"train": 180, "infer": 30}
REQUIRED_KIND = {"train": "GPU"}  # infer: no kind restriction

# one metric-card template set per job.type, copied verbatim into job_metric_profile on submission
METRIC_TEMPLATES: dict[str, list[dict]] = {
    "train": [
        {
            "seq": 1,
            "label": "정확도",
            "unit": "%",
            "start_value": Decimal("40"),
            "target_value": Decimal("92"),
            "curve_shape": "exp_approach",
            "total_count": None,
            "featured": True,
        },
        {
            "seq": 2,
            "label": "에포크",
            "unit": None,
            "start_value": None,
            "target_value": None,
            "curve_shape": None,
            "total_count": 100,
            "featured": False,
        },
    ],
    "infer": [
        {
            "seq": 1,
            "label": "처리량",
            "unit": "req/s",
            "start_value": Decimal("350"),
            "target_value": Decimal("420"),
            "curve_shape": "exp_approach",
            "total_count": None,
            "featured": True,
        },
        {
            "seq": 2,
            "label": "응답지연 p50",
            "unit": "ms",
            "start_value": None,
            "target_value": Decimal("12"),
            "curve_shape": None,
            "total_count": None,
            "featured": False,
        },
        {
            "seq": 3,
            "label": "응답지연 p99",
            "unit": "ms",
            "start_value": None,
            "target_value": Decimal("38"),
            "curve_shape": None,
            "total_count": None,
            "featured": False,
        },
        {
            "seq": 4,
            "label": "누적 요청 수",
            "unit": None,
            "start_value": None,
            "target_value": None,
            "curve_shape": None,
            "total_count": 12000,
            "featured": False,
        },
        {
            "seq": 5,
            "label": "KV 캐시 적중률",
            "unit": "%",
            "start_value": Decimal("45"),
            "target_value": Decimal("88"),
            "curve_shape": "exp_approach",
            "total_count": None,
            "featured": False,
        },
        {
            "seq": 6,
            "label": "요청당 전력",
            "unit": "J",
            "start_value": None,
            "target_value": Decimal("0.42"),
            "curve_shape": None,
            "total_count": None,
            "featured": False,
        },
        {
            "seq": 7,
            "label": "Prefill 비율",
            "unit": "%",
            "start_value": None,
            "target_value": Decimal("35"),
            "curve_shape": None,
            "total_count": None,
            "featured": False,
        },
        {
            "seq": 8,
            "label": "Decode 비율",
            "unit": "%",
            "start_value": None,
            "target_value": Decimal("65"),
            "curve_shape": None,
            "total_count": None,
            "featured": False,
        },
    ],
    "distributed": [
        {
            "seq": 1,
            "label": "글로벌 정확도",
            "unit": "%",
            "start_value": Decimal("60"),
            "target_value": Decimal("92"),
            "curve_shape": "exp_approach",
            "total_count": None,
            "featured": True,
        },
        {
            "seq": 2,
            "label": "라운드",
            "unit": None,
            "start_value": None,
            "target_value": None,
            "curve_shape": None,
            "total_count": 50,
            "featured": False,
        },
        {
            "seq": 3,
            "label": "참여 사이트",
            "unit": "곳",
            "start_value": Decimal("3"),
            "target_value": Decimal("3"),
            "curve_shape": None,
            "total_count": None,
            "featured": False,
        },
    ],
}


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


def _seed_metric_profiles(db: Session, job: models.Job) -> None:
    for template in METRIC_TEMPLATES.get(job.type, []):
        db.add(models.JobMetricProfile(job_id=job.id, **template))


def _admit(db: Session, job: models.Job, node: models.Node, start_time: datetime, event_type: str) -> None:
    db.add(models.Assignment(job_id=job.id, node_id=node.id, from_t=start_time, to_t=None))
    job.status = "running"
    job.started_at = start_time
    _log_event(
        db, type=event_type, now=start_time, job_id=job.id, node_id=node.id, cluster_id=node.cluster_id
    )


def sweep_and_backfill(db: Session) -> None:
    now = clock.now()

    running_jobs = (
        db.query(models.Job)
        .filter(models.Job.status == "running")
        .options(selectinload(models.Job.assignments).selectinload(models.Assignment.node))
        .all()
    )
    # node_id -> the correct instant it was vacated (its ex-occupant's deadline),
    # not whenever this sweep happened to notice
    freed_at: dict[int, datetime] = {}
    for job in running_jobs:
        deadline = job.started_at + timedelta(seconds=DURATION_SEC[job.type])
        if deadline <= now:
            job.status = "done"
            job.finished_at = deadline
            for assignment in job.assignments:
                if assignment.to_t is None:
                    assignment.to_t = deadline
                    freed_at[assignment.node_id] = deadline
                    _log_event(
                        db,
                        type="FINISH",
                        now=deadline,
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
                start_time = max(job.submitted_at, freed_at.get(node.id, job.submitted_at))
                _admit(db, job, node, start_time, event_type="BACKFILL")
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
            selectinload(models.Job.metric_profiles),
            selectinload(models.Job.cache_profile),
            selectinload(models.Job.cache_tiers),
        )
        .filter(models.Job.id == job_id)
        .first()
    )
    if job is None:
        return None

    metrics = [
        schemas.JobMetricProfileItem(
            id=m.id,
            seq=m.seq,
            label=m.label,
            unit=m.unit,
            start_value=m.start_value,
            target_value=m.target_value,
            curve_shape=m.curve_shape,
            total_count=m.total_count,
            featured=m.featured,
        )
        for m in sorted(job.metric_profiles, key=lambda m: m.seq)
    ]

    cache = (
        schemas.JobCacheSummary(
            latency_reduction_pct=job.cache_profile.latency_reduction_pct,
            tiers=[
                schemas.JobCacheTierItem(
                    id=t.id, tier_name=t.tier_name, fill_pct=t.fill_pct, latency_ms=t.latency_ms
                )
                for t in job.cache_tiers
            ],
        )
        if job.cache_profile is not None
        else None
    )

    return schemas.JobDetail(
        **_to_job_summary(job).model_dump(),
        metrics=metrics,
        cache=cache,
    )


def get_negotiations(db: Session, job_id: int) -> schemas.JobNegotiationResponse | None:
    negotiation = (
        db.query(models.JobNegotiation).filter(models.JobNegotiation.job_id == job_id).first()
    )
    if negotiation is None:
        return None

    items = (
        db.query(models.JobNegotiationItem)
        .filter(models.JobNegotiationItem.job_id == job_id)
        .order_by(models.JobNegotiationItem.seq)
        .all()
    )
    return schemas.JobNegotiationResponse(
        rounds=negotiation.rounds,
        agreement_pct=negotiation.agreement_pct,
        proposed=[i.text for i in items if i.side == "proposed"],
        agreed=[i.text for i in items if i.side == "agreed"],
    )


def list_job_assignments(db: Session, job_id: int) -> list[schemas.AssignmentItem] | None:
    job = db.query(models.Job).filter(models.Job.id == job_id).first()
    if job is None:
        return None

    assignments = (
        db.query(models.Assignment)
        .filter(models.Assignment.job_id == job_id)
        .order_by(models.Assignment.from_t)
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


def list_reallocations(db: Session, job_id: int) -> list[schemas.ReallocationItem] | None:
    job = db.query(models.Job).filter(models.Job.id == job_id).first()
    if job is None:
        return None

    rows = (
        db.query(models.Reallocation)
        .filter(
            or_(
                models.Reallocation.donor_job_id == job_id,
                models.Reallocation.receiver_job_id == job_id,
            )
        )
        .order_by(models.Reallocation.at_t_offset_sec)
        .all()
    )
    return [
        schemas.ReallocationItem(
            id=r.id,
            donor_job_id=r.donor_job_id,
            receiver_job_id=r.receiver_job_id,
            node_id=r.node_id,
            at_t_offset_sec=r.at_t_offset_sec,
            downtime_sec=r.downtime_sec,
            resume_delay_sec=r.resume_delay_sec,
        )
        for r in rows
    ]


def get_kqv_benchmark(db: Session, job_id: int) -> schemas.JobKqvBenchmarkResponse | None:
    benchmark = (
        db.query(models.JobKqvBenchmark).filter(models.JobKqvBenchmark.job_id == job_id).first()
    )
    if benchmark is None:
        return None

    return schemas.JobKqvBenchmarkResponse(
        kqv_gain_pct=benchmark.kqv_gain_pct,
        kqv_even_makespan_sec=benchmark.kqv_even_makespan_sec,
        kqv_opt_makespan_sec=benchmark.kqv_opt_makespan_sec,
    )


def list_hyperparam_adjustments(
    db: Session, job_id: int
) -> list[schemas.HyperparamAdjustmentItem] | None:
    job = db.query(models.Job).filter(models.Job.id == job_id).first()
    if job is None:
        return None

    rows = (
        db.query(models.HyperparamAdjustment)
        .filter(models.HyperparamAdjustment.job_id == job_id)
        .order_by(models.HyperparamAdjustment.seq)
        .all()
    )
    return [
        schemas.HyperparamAdjustmentItem(
            id=r.id,
            seq=r.seq,
            t_offset_sec=r.t_offset_sec,
            param_name=r.param_name,
            from_value=r.from_value,
            to_value=r.to_value,
            reward=r.reward,
        )
        for r in rows
    ]


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
    _seed_metric_profiles(db, job)
    _log_event(db, type="ARRIVAL", now=now, job_id=job.id)

    live_cluster = _load_live_cluster(db)
    node = None
    if live_cluster is not None:
        occupied = _occupied_node_ids(live_cluster, now)
        node = _pick_free_node(live_cluster, job.type, occupied)
        if node is not None:
            _admit(db, job, node, now, event_type="START")

    if node is None:
        _log_event(db, type="QUEUE", now=now, job_id=job.id)

    db.commit()
    db.refresh(job)
    return _to_job_summary(job)
