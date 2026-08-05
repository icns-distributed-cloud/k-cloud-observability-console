from datetime import datetime, timedelta
from decimal import Decimal

from fastapi import Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session, selectinload

from app import clock, models, schemas
from app.database import get_db

DURATION_SEC = {"train": 40, "infer": 15}

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
}


def _to_selected_tier(tier: models.ResourceTier | None) -> schemas.SelectedTierSummary | None:
    if tier is None:
        return None
    return schemas.SelectedTierSummary(
        id=tier.id,
        tier_no=tier.tier_no,
        cost_per_hour=tier.cost_per_hour,
        requirements=[
            schemas.TierRequirementItem(kind=r.kind, node_count=r.node_count) for r in tier.requirements
        ],
    )


def _to_job_summary(job: models.Job) -> schemas.JobSummary:
    return schemas.JobSummary(
        id=job.id,
        model_id=job.model_id,
        model_name=job.model.name,
        user_id=job.user_id,
        type=job.type,
        status=job.status,
        batch=job.batch,
        priority_pref=job.priority_pref,
        submitted_at=job.submitted_at,
        started_at=job.started_at,
        finished_at=job.finished_at,
        dataset_id=job.dataset_id,
        dataset_name=job.dataset.name if job.dataset is not None else None,
        selected_tier=_to_selected_tier(job.selected_tier),
        assigned_nodes=[
            schemas.AssignedNodeItem(
                node_id=a.node.id,
                node_name=a.node.name,
                cluster_id=a.node.cluster.id,
                cluster_name=a.node.cluster.name,
            )
            for a in job.assignments
        ],
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


def _pick_free_nodes_for_tier(
    live_cluster: models.Cluster, tier: models.ResourceTier, occupied_node_ids: set[int]
) -> list[models.Node] | None:
    free_by_kind: dict[str, list[models.Node]] = {}
    for node in live_cluster.nodes:
        if node.id in occupied_node_ids or node.purpose != tier.job_type:
            continue
        for kind in {a.kind for a in node.accelerators}:
            free_by_kind.setdefault(kind, []).append(node)

    picked: list[models.Node] = []
    picked_ids: set[int] = set()
    for req in tier.requirements:
        candidates = [n for n in free_by_kind.get(req.kind, []) if n.id not in picked_ids]
        if len(candidates) < req.node_count:
            return None
        for node in candidates[: req.node_count]:
            picked.append(node)
            picked_ids.add(node.id)
    return picked


def _free_node_counts_by_kind(
    live_cluster: models.Cluster, job_type: str, occupied_node_ids: set[int]
) -> dict[str, int]:
    counts: dict[str, int] = {}
    for node in live_cluster.nodes:
        if node.id in occupied_node_ids or node.purpose != job_type:
            continue
        for kind in {a.kind for a in node.accelerators}:
            counts[kind] = counts.get(kind, 0) + 1
    return counts


def _sort_tiers_by_priority(
    tiers: list[schemas.ResourceTierItem], priority_pref: str | None
) -> list[schemas.ResourceTierItem]:
    # tier_no already IS the performance rank (1 = best, set at seed time), so "time
    # 우선" just sorts by it directly - no separate score field needed.
    if priority_pref == "time":
        return sorted(tiers, key=lambda t: t.tier_no)
    if priority_pref == "cost":
        return sorted(tiers, key=lambda t: t.cost_per_hour)
    if priority_pref == "balanced":
        cost_rank = {t.id: rank for rank, t in enumerate(sorted(tiers, key=lambda t: t.cost_per_hour), start=1)}
        return sorted(tiers, key=lambda t: cost_rank[t.id] + t.tier_no)
    return tiers


def list_resource_tiers(
    db: Session, job_type: str, priority_pref: str | None = None
) -> list[schemas.ResourceTierItem]:
    live_cluster = _load_live_cluster(db)
    if live_cluster is None:
        return []

    occupied = _occupied_node_ids(live_cluster, clock.now())
    free_counts = _free_node_counts_by_kind(live_cluster, job_type, occupied)

    tiers = (
        db.query(models.ResourceTier)
        .options(selectinload(models.ResourceTier.requirements))
        .filter(
            models.ResourceTier.cluster_id == live_cluster.id,
            models.ResourceTier.job_type == job_type,
        )
        .order_by(models.ResourceTier.tier_no)
        .all()
    )
    items = [
        schemas.ResourceTierItem(
            id=t.id,
            tier_no=t.tier_no,
            cost_per_hour=t.cost_per_hour,
            requirements=[
                schemas.TierRequirementItem(kind=r.kind, node_count=r.node_count) for r in t.requirements
            ],
            available=all(free_counts.get(r.kind, 0) >= r.node_count for r in t.requirements),
        )
        for t in tiers
    ]
    return _sort_tiers_by_priority(items, priority_pref)


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


def _admit(
    db: Session, job: models.Job, nodes: list[models.Node], start_time: datetime, event_type: str
) -> None:
    job.status = "running"
    job.started_at = start_time
    for node in nodes:
        db.add(models.Assignment(job_id=job.id, node_id=node.id, from_t=start_time, to_t=None))
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
            .options(selectinload(models.Job.selected_tier).selectinload(models.ResourceTier.requirements))
            .order_by(models.Job.submitted_at)
            .all()
        )
        for job in queued_jobs:
            if job.selected_tier is None:
                continue
            nodes = _pick_free_nodes_for_tier(live_cluster, job.selected_tier, occupied)
            if nodes is not None:
                start_time = max(
                    [job.submitted_at] + [freed_at.get(n.id, job.submitted_at) for n in nodes]
                )
                _admit(db, job, nodes, start_time, event_type="BACKFILL")
                occupied.update(n.id for n in nodes)

    db.commit()


def sweep_dependency(db: Session = Depends(get_db)) -> None:
    sweep_and_backfill(db)


def list_jobs(db: Session, status: str | None = None, user_id: int | None = None) -> list[schemas.JobSummary]:
    query = db.query(models.Job).options(
        selectinload(models.Job.model),
        selectinload(models.Job.dataset),
        selectinload(models.Job.selected_tier).selectinload(models.ResourceTier.requirements),
        selectinload(models.Job.assignments).selectinload(models.Assignment.node).selectinload(models.Node.cluster),
    )
    if status is not None:
        query = query.filter(models.Job.status == status)
    if user_id is not None:
        query = query.filter(models.Job.user_id == user_id)
    return [_to_job_summary(job) for job in query.all()]


def get_job_detail(db: Session, job_id: int) -> schemas.JobDetail | None:
    job = (
        db.query(models.Job)
        .options(
            selectinload(models.Job.model),
            selectinload(models.Job.dataset),
            selectinload(models.Job.metric_profiles),
            selectinload(models.Job.cache_profile),
            selectinload(models.Job.cache_tiers),
            selectinload(models.Job.selected_tier).selectinload(models.ResourceTier.requirements),
            selectinload(models.Job.assignments)
            .selectinload(models.Assignment.node)
            .selectinload(models.Node.cluster),
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
    priority_pref: str,
    tier_id: int,
    user_id: int,
    dataset_id: int | None = None,
) -> schemas.JobSummary:
    tier = (
        db.query(models.ResourceTier)
        .options(selectinload(models.ResourceTier.requirements))
        .filter(models.ResourceTier.id == tier_id)
        .first()
    )
    if tier is None:
        raise HTTPException(status_code=400, detail="invalid tier_id")
    if tier.job_type != job_type:
        raise HTTPException(status_code=400, detail="tier_id does not match job type")

    now = clock.now()
    job = models.Job(
        model_id=model_id,
        user_id=user_id,
        type=job_type,
        status="queued",
        batch=batch,
        priority_pref=priority_pref,
        submitted_at=now,
        dataset_id=dataset_id,
        selected_tier_id=tier_id,
    )
    db.add(job)
    db.flush()
    _seed_metric_profiles(db, job)
    _log_event(db, type="ARRIVAL", now=now, job_id=job.id)

    live_cluster = _load_live_cluster(db)
    nodes = None
    if live_cluster is not None:
        occupied = _occupied_node_ids(live_cluster, now)
        nodes = _pick_free_nodes_for_tier(live_cluster, tier, occupied)
        if nodes is not None:
            _admit(db, job, nodes, now, event_type="START")

    if nodes is None:
        _log_event(db, type="QUEUE", now=now, job_id=job.id)

    db.commit()
    db.refresh(job)
    return _to_job_summary(job)
