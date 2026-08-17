import random
from datetime import datetime, timedelta
from decimal import Decimal

from fastapi import Depends, HTTPException
from sqlalchemy import case, or_, text
from sqlalchemy.orm import Session, selectinload

from app import clock, models, schemas
from app.database import get_db

DURATION_SEC = {"train": 40, "infer": 15}

# Arbitrary constant key for a Postgres advisory lock guarding every
# read-then-write job/assignment state change (submit_job's immediate admit,
# sweep_and_backfill's backfill/finish loops, filler creation, stop_job).
# Without it, concurrent requests (polling from multiple tabs, two submits at
# once, a double-clicked stop) can each read the same pre-commit snapshot and
# double-admit the same job, double-book the same node, or double-log a
# FINISH. Held for the rest of the transaction (pg_advisory_xact_lock),
# released on commit/rollback - callers should acquire it before reading any
# state the decision depends on.
_ADMISSION_LOCK_KEY = 851203


def _lock_admission(db: Session) -> None:
    db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": _ADMISSION_LOCK_KEY})

# Demo-only: keeps the scheduler timeline visibly busy at an unattended booth without
# a human re-seeding between runs. Piggybacks on the sweep that already runs on every
# job-touching request - no separate worker/cron.
# tier 2 (train, A100 x1) is reserved for whoever is actually running the live demo -
# fillers must never touch it or its node pool, so tier 4 (train, A100 x3 - same pool)
# is excluded too. tier 8 (infer, PIM x2) is excluded because only 1 PIM node exists,
# so it can never be admitted and would just pile up in the queue forever.
FILLER_USER_NAME = "csc-demo-filler"
FILLER_EXCLUDED_TIER_IDS = {2, 4, 8}
FILLER_TARGET_PER_TYPE = 2
# randomized per filler job (via job.duration_sec) instead of the fixed DURATION_SEC,
# so the scheduler timeline doesn't show every bar at an identical length.
# Train's ceiling is capped below DURATION_SEC-scale demo patience (see
# sweep_and_backfill's filler-deprioritization) so a filler holding the only
# matching node never blocks a real job for much more than ~1 cycle.
FILLER_DURATION_RANGE_SEC = {"train": (25, 50), "infer": (8, 30)}

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
            schemas.TierRequirementItem(
                kind=r.kind,
                model_name=r.accelerator_model.name if r.accelerator_model is not None else None,
                node_count=r.node_count,
            )
            for r in tier.requirements
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


def _node_matches_requirement(node: models.Node, kind: str, accelerator_model_id: int | None) -> bool:
    return any(
        a.kind == kind and (accelerator_model_id is None or a.accelerator_model_id == accelerator_model_id)
        for a in node.accelerators
    )


def _free_nodes_for_requirement(
    live_cluster: models.Cluster,
    job_type: str,
    occupied_node_ids: set[int],
    excluded_node_ids: set[int],
    kind: str,
    accelerator_model_id: int | None,
) -> list[models.Node]:
    return [
        node
        for node in live_cluster.nodes
        if node.id not in occupied_node_ids
        and node.id not in excluded_node_ids
        and node.purpose == job_type
        and _node_matches_requirement(node, kind, accelerator_model_id)
    ]


def _pick_free_nodes_for_tier(
    live_cluster: models.Cluster, tier: models.ResourceTier, occupied_node_ids: set[int]
) -> list[models.Node] | None:
    picked: list[models.Node] = []
    picked_ids: set[int] = set()
    for req in tier.requirements:
        candidates = _free_nodes_for_requirement(
            live_cluster, tier.job_type, occupied_node_ids, picked_ids, req.kind, req.accelerator_model_id
        )
        if len(candidates) < req.node_count:
            return None
        # shuffled so which nodes get picked varies run to run instead of always the
        # same first-N-by-id - purely cosmetic, doesn't change whether the tier can
        # be satisfied (still gated by len(candidates) >= req.node_count above)
        random.shuffle(candidates)
        for node in candidates[: req.node_count]:
            picked.append(node)
            picked_ids.add(node.id)
    return picked


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

    tiers = (
        db.query(models.ResourceTier)
        .options(selectinload(models.ResourceTier.requirements).selectinload(models.ResourceTierRequirement.accelerator_model))
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
                schemas.TierRequirementItem(
                    kind=r.kind,
                    model_name=r.accelerator_model.name if r.accelerator_model is not None else None,
                    node_count=r.node_count,
                )
                for r in t.requirements
            ],
            available=all(
                len(
                    _free_nodes_for_requirement(
                        live_cluster, job_type, occupied, set(), r.kind, r.accelerator_model_id
                    )
                )
                >= r.node_count
                for r in t.requirements
            ),
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


def _seed_optimization_data(db: Session, job: models.Job) -> None:
    # Only called from submit_job, not from the filler-job path - fillers are hidden
    # from the default job list anyway, so nobody ever opens their 최적화 tab.
    if job.type == "train":
        duration = DURATION_SEC["train"]
        db.add(
            models.HyperparamAdjustment(
                job_id=job.id,
                seq=1,
                t_offset_sec=int(duration * 0.3),
                param_name="배치 크기",
                from_value="512",
                to_value="640",
                reward="+0.021",
            )
        )
        db.add(
            models.HyperparamAdjustment(
                job_id=job.id,
                seq=2,
                t_offset_sec=int(duration * 0.7),
                param_name="데이터 shard",
                from_value="4-way",
                to_value="6-way",
                reward="+0.014",
            )
        )
        db.add(
            models.JobKqvBenchmark(
                job_id=job.id,
                kqv_gain_pct=Decimal("21.5"),
                kqv_even_makespan_sec=Decimal("77040"),
                kqv_opt_makespan_sec=Decimal("60480"),
            )
        )
    elif job.type == "infer":
        db.add(models.JobCacheProfile(job_id=job.id, latency_reduction_pct=Decimal("33.0")))
        db.add(
            models.JobCacheTier(
                job_id=job.id, tier_name="VRAM", fill_pct=Decimal("82.0"), latency_ms=Decimal("0.4")
            )
        )
        db.add(
            models.JobCacheTier(
                job_id=job.id, tier_name="DRAM", fill_pct=Decimal("55.0"), latency_ms=Decimal("2.1")
            )
        )
        db.add(
            models.JobCacheTier(
                job_id=job.id, tier_name="SSD", fill_pct=Decimal("20.0"), latency_ms=Decimal("18.0")
            )
        )


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


def _filler_user_id(db: Session) -> int | None:
    filler_user = db.query(models.User).filter(models.User.name == FILLER_USER_NAME).first()
    return filler_user.id if filler_user is not None else None


def _maintain_filler_jobs(db: Session, now: datetime) -> None:
    filler_user_id = _filler_user_id(db)
    if filler_user_id is None:
        return  # seed hasn't created the demo-filler user - feature quietly does nothing

    model_ids = [m.id for m in db.query(models.Model.id).all()]
    if not model_ids:
        return

    tiers = (
        db.query(models.ResourceTier)
        .filter(~models.ResourceTier.id.in_(FILLER_EXCLUDED_TIER_IDS))
        .all()
    )
    tiers_by_type: dict[str, list[models.ResourceTier]] = {}
    for tier in tiers:
        tiers_by_type.setdefault(tier.job_type, []).append(tier)

    for job_type, type_tiers in tiers_by_type.items():
        if not type_tiers:
            continue
        active_count = (
            db.query(models.Job)
            .filter(
                models.Job.user_id == filler_user_id,
                models.Job.type == job_type,
                models.Job.status.in_(["running", "queued"]),
            )
            .count()
        )
        # at most one per sweep per type, even if further below target - staggers
        # starts across polls instead of bursting several nodes on at once
        if active_count < FILLER_TARGET_PER_TYPE:
            tier = random.choice(type_tiers)
            job = models.Job(
                model_id=random.choice(model_ids),
                user_id=filler_user_id,
                type=job_type,
                status="queued",
                batch=16,
                priority_pref="time",
                submitted_at=now,
                selected_tier_id=tier.id,
                duration_sec=random.randint(*FILLER_DURATION_RANGE_SEC[job_type]),
            )
            db.add(job)
            db.flush()
            _seed_metric_profiles(db, job)
            _log_event(db, type="ARRIVAL", now=now, job_id=job.id)


def sweep_and_backfill(db: Session) -> None:
    _lock_admission(db)
    now = clock.now()
    _maintain_filler_jobs(db, now)

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
        if job.type == "infer" and job.duration_sec is None:
            # a real (non-filler) infer job - runs indefinitely, like a persistent
            # serving workload, until stopped through a future explicit stop
            # endpoint. Fillers always carry an explicit duration_sec, so they're
            # unaffected and keep cycling normally.
            continue
        duration = job.duration_sec if job.duration_sec is not None else DURATION_SEC[job.type]
        deadline = job.started_at + timedelta(seconds=duration)
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
        filler_user_id = _filler_user_id(db)
        # Real jobs get first crack at freed capacity every sweep; fillers only
        # backfill into whatever real jobs don't need. Within each group it's
        # still submitted_at order, so backfill among real jobs (or among
        # fillers) behaves exactly as before - fillers are demo-only dressing
        # and shouldn't make an actual user wait behind them.
        order_cols = (
            [case((models.Job.user_id == filler_user_id, 1), else_=0), models.Job.submitted_at]
            if filler_user_id is not None
            else [models.Job.submitted_at]
        )
        queued_jobs = (
            db.query(models.Job)
            .filter(models.Job.status == "queued")
            .options(selectinload(models.Job.selected_tier).selectinload(models.ResourceTier.requirements).selectinload(models.ResourceTierRequirement.accelerator_model))
            .order_by(*order_cols)
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


def list_jobs(
    db: Session,
    status: str | None = None,
    user_id: int | None = None,
    include_fillers: bool = False,
) -> list[schemas.JobSummary]:
    query = db.query(models.Job).options(
        selectinload(models.Job.model),
        selectinload(models.Job.dataset),
        selectinload(models.Job.selected_tier).selectinload(models.ResourceTier.requirements).selectinload(models.ResourceTierRequirement.accelerator_model),
        selectinload(models.Job.assignments).selectinload(models.Assignment.node).selectinload(models.Node.cluster),
    )
    if status is not None:
        query = query.filter(models.Job.status == status)
    if user_id is not None:
        query = query.filter(models.Job.user_id == user_id)
    elif not include_fillers:
        # no explicit user filter means "show everything" (CSP's job list) - demo
        # filler jobs are noise there, not something a real viewer asked to see.
        # An explicit ?user_id=<filler id> still works, this only affects the default.
        # include_fillers=true opts back in (e.g. cluster detail's node-occupancy card,
        # which needs the real job behind every active assignment, filler or not).
        filler_user = db.query(models.User).filter(models.User.name == FILLER_USER_NAME).first()
        if filler_user is not None:
            query = query.filter(models.Job.user_id != filler_user.id)
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
            selectinload(models.Job.selected_tier).selectinload(models.ResourceTier.requirements).selectinload(models.ResourceTierRequirement.accelerator_model),
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
        .options(selectinload(models.ResourceTier.requirements).selectinload(models.ResourceTierRequirement.accelerator_model))
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
    _seed_optimization_data(db, job)
    _log_event(db, type="ARRIVAL", now=now, job_id=job.id)

    _lock_admission(db)
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


def stop_job(db: Session, job_id: int) -> schemas.JobSummary | None:
    _lock_admission(db)
    job = (
        db.query(models.Job)
        .options(selectinload(models.Job.assignments).selectinload(models.Assignment.node))
        .filter(models.Job.id == job_id)
        .first()
    )
    if job is None:
        return None
    if job.type != "infer":
        raise HTTPException(status_code=400, detail="only infer jobs can be stopped")
    if job.status != "running":
        raise HTTPException(status_code=400, detail="job is not running")

    now = clock.now()
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

    db.commit()
    db.refresh(job)
    return _to_job_summary(job)
