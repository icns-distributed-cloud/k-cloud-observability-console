import random
import time
from datetime import datetime, timedelta
from decimal import Decimal

from fastapi import Depends, HTTPException
from sqlalchemy import case, desc, or_, text
from sqlalchemy.orm import Query, Session, selectinload

from app import clock, models, schemas
from app.database import get_db
from app.services.infra import _evaluate

DURATION_SEC = {"train": 40, "infer": 15}
# real job lifecycle either side of "running": nodes are assigned (and stay
# occupied - see _occupied_node_ids, which only looks at Assignment rows and
# doesn't care about status) before compute actually starts (container/model
# load) and after compute ends (checkpoint/result save) before they're freed.
# Kept comfortably longer than the job status board's poll interval (frontend
# JobStatusBoard.tsx, POLL_MS) so the phase reliably shows up in at least one
# poll instead of being skipped between two fetches.
PROVISIONING_SEC = {"train": 10, "infer": 8}
FINALIZING_SEC = {"train": 8, "infer": 6}

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
# infer's GPU pool (tier 7) is now 4 nodes deep vs train's single-node-per-tier caps,
# so a shared target undersold how much concurrency infer can actually show - split
# per type instead of bumping the shared value and over-filling train.
FILLER_TARGET_PER_TYPE = {"train": 4, "infer": 6}
# randomized per filler job (via job.duration_sec) instead of the fixed DURATION_SEC,
# so the scheduler timeline doesn't show every bar at an identical length. Kept short
# so fillers cycle through provisioning->running->finalizing->done quickly - more
# visible turnover in the job list/timeline, and any filler holding a node only
# blocks a real job for a short window.
FILLER_DURATION_RANGE_SEC = {"train": (15, 30), "infer": (5, 15)}

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


def _phase_progress(job: models.Job) -> float | None:
    """0~1, 현재 단계(provisioning/finalizing/running) 안에서 얼마나 지났는지.
    phase_deadline은 "이 단계가 언제 끝나는지"만 들고 있으니, 단계별 고정 길이를 빼면
    단계 시작 시각이 나오고 거기서 경과 비율을 계산할 수 있다. queued/done이면 None.
    추론의 running도 전부 None - 실제 제출된 추론은 무기한 실행이라 애초에
    phase_deadline이 없고, 필러 추론은 고정 duration이 있어 값을 낼 수는 있지만
    그러면 "이 추론은 왜 진행률이 있고 저건 없지"처럼 일관성이 깨진다."""
    if job.phase_deadline is None:
        return None
    if job.type == "infer" and job.status == "running":
        return None
    if job.status == "provisioning":
        duration = PROVISIONING_SEC[job.type]
    elif job.status == "finalizing":
        duration = FINALIZING_SEC[job.type]
    elif job.status == "running":
        duration = job.duration_sec if job.duration_sec is not None else DURATION_SEC[job.type]
    else:
        return None

    phase_start = job.phase_deadline - timedelta(seconds=duration)
    elapsed = (clock.now() - phase_start).total_seconds()
    return max(0.0, min(1.0, elapsed / duration))


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
        phase_progress=_phase_progress(job),
    )


def _load_live_cluster(db: Session) -> models.Cluster | None:
    return (
        db.query(models.Cluster)
        .options(
            selectinload(models.Cluster.nodes).selectinload(models.Node.accelerators),
            selectinload(models.Cluster.nodes).selectinload(models.Node.assignments),
            selectinload(models.Cluster.nodes).selectinload(models.Node.metric_profiles),
        )
        .filter(models.Cluster.is_live.is_(True))
        .first()
    )


# 스케줄러 페이지의 "예측 기반 배치" 패널(frontend PREDICTION_LOOKAHEAD_SEC)과 맞춘
# 값 - 둘이 어긋나면 화면에 뜬 1순위 후보와 실제로 배정되는 노드가 달라진다.
_PREDICTION_LOOKAHEAD_SEC = 30


def _predicted_util(node: models.Node) -> float:
    # infra.py의 _evaluate(같은 baseline+amplitude*sin(...) 공식)를 그대로 재사용 -
    # 프론트의 예측 패널도 같은 원리(실측 파형을 미래 시점에서 한 번 더 평가)로
    # "예측 활용률"을 뽑는다. 노드에 util 프로파일이 없으면(있어야 정상) 0으로 다뤄
    # 그 노드가 오히려 앞순위로 밀리지 않게 큰 값을 대신 준다.
    predict_at = time.time() + _PREDICTION_LOOKAHEAD_SEC
    for p in node.metric_profiles:
        if p.metric_type == "util":
            return _evaluate(p.baseline, p.amplitude, p.period_sec, now=predict_at)
    return float("inf")


def _predicted_power(node: models.Node) -> float:
    predict_at = time.time() + _PREDICTION_LOOKAHEAD_SEC
    for p in node.metric_profiles:
        if p.metric_type == "power":
            return _evaluate(p.baseline, p.amplitude, p.period_sec, now=predict_at)
    return float("inf")


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
        # 예측 활용률이 낮은(=여유 있는) 노드부터, 동률이면 예측 전력이 낮은 순 - 스케줄러
        # 페이지의 "예측 기반 배치" 패널이 보여주는 순위와 같은 규칙이다. 예전엔
        # random.shuffle로 아무 노드나 골랐는데, 그러면 화면에 뜬 1순위 후보가 실제
        # 배정 노드와 종종 달라 보여서(순전히 장식이라는 문구를 달아야 했다) 둘을
        # 맞췄다. 여전히 어느 노드를 고르든 tier 충족 여부는 안 바뀐다(위의 node_count
        # 체크로 이미 결정됨) - 순서만 예측과 일치시키는 것뿐이다.
        candidates.sort(key=lambda n: (_predicted_util(n), _predicted_power(n)))
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
    # node(s) are held from here (Assignment.from_t=start_time) through
    # provisioning -> running -> finalizing, all the way to done - only the
    # job's own status label cycles in between, admission itself doesn't care.
    job.status = "provisioning"
    job.started_at = start_time
    job.phase_deadline = start_time + timedelta(seconds=PROVISIONING_SEC[job.type])
    for node in nodes:
        db.add(models.Assignment(job_id=job.id, node_id=node.id, from_t=start_time, to_t=None))
        _log_event(
            db, type=event_type, now=start_time, job_id=job.id, node_id=node.id, cluster_id=node.cluster_id
        )


def _filler_user_id(db: Session) -> int | None:
    filler_user = db.query(models.User).filter(models.User.name == FILLER_USER_NAME).first()
    return filler_user.id if filler_user is not None else None


def _tier_capacity_weight(live_cluster: models.Cluster, tier: models.ResourceTier) -> int:
    """how many instances of this tier the live cluster's node inventory can even run
    at once, e.g. infer tier 7 (GPU x1) has 4 matching nodes -> weight 4, while tier 6
    (NPU x1) has only 1 -> weight 1. Bottlenecked by the scarcest requirement, same as
    _pick_free_nodes_for_tier's admission check but against ALL matching nodes, not
    just currently-free ones. Used to weight random tier choice below - without this,
    a scarce tier (1 node) and a plentiful one (4 nodes) were picked equally often,
    so fillers piled up queued jobs on the scarce tier while the plentiful one sat idle."""
    weight = None
    for req in tier.requirements:
        total = sum(
            1
            for node in live_cluster.nodes
            if node.purpose == tier.job_type and _node_matches_requirement(node, req.kind, req.accelerator_model_id)
        )
        cap = total // req.node_count
        weight = cap if weight is None else min(weight, cap)
    return max(weight or 0, 1)


def _maintain_filler_jobs(db: Session, now: datetime) -> None:
    filler_user_id = _filler_user_id(db)
    if filler_user_id is None:
        return  # seed hasn't created the demo-filler user - feature quietly does nothing

    model_ids = [m.id for m in db.query(models.Model.id).all()]
    if not model_ids:
        return

    live_cluster = _load_live_cluster(db)

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
                models.Job.status.in_(["queued", "provisioning", "running", "finalizing"]),
            )
            .count()
        )
        # at most one per sweep per type, even if further below target - staggers
        # starts across polls instead of bursting several nodes on at once
        if active_count < FILLER_TARGET_PER_TYPE[job_type]:
            if live_cluster is not None:
                weights = [_tier_capacity_weight(live_cluster, t) for t in type_tiers]
                tier = random.choices(type_tiers, weights=weights, k=1)[0]
            else:
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

    # Phase-advance every job whose current status has a pending auto-transition
    # (phase_deadline set and passed). Node occupancy (Assignment.from_t/to_t) is
    # untouched by provisioning->running and running->finalizing - _occupied_node_ids
    # only looks at assignments, not job.status, so admission is unaffected. Only
    # finalizing->done actually frees the node.
    provisioning_jobs = (
        db.query(models.Job)
        .filter(models.Job.status == "provisioning", models.Job.phase_deadline <= now)
        .all()
    )
    for job in provisioning_jobs:
        job.status = "running"
        if job.duration_sec is not None:
            duration = job.duration_sec
        elif job.type == "infer":
            # a real (non-filler) infer job - runs indefinitely, like a persistent
            # serving workload, until stopped through a future explicit stop
            # endpoint. Fillers always carry an explicit duration_sec, so they're
            # unaffected and keep cycling normally.
            duration = None
        else:
            duration = DURATION_SEC[job.type]
        job.phase_deadline = now + timedelta(seconds=duration) if duration is not None else None

    running_jobs = (
        db.query(models.Job)
        .filter(
            models.Job.status == "running",
            models.Job.phase_deadline.is_not(None),
            models.Job.phase_deadline <= now,
        )
        .all()
    )
    for job in running_jobs:
        job.status = "finalizing"
        job.phase_deadline = now + timedelta(seconds=FINALIZING_SEC[job.type])

    finalizing_jobs = (
        db.query(models.Job)
        .filter(models.Job.status == "finalizing", models.Job.phase_deadline <= now)
        .options(selectinload(models.Job.assignments).selectinload(models.Assignment.node))
        .all()
    )
    # node_id -> the correct instant it was vacated (its ex-occupant's deadline),
    # not whenever this sweep happened to notice
    freed_at: dict[int, datetime] = {}
    for job in finalizing_jobs:
        deadline = job.phase_deadline
        job.status = "done"
        job.finished_at = deadline
        job.phase_deadline = None
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


JOB_LIST_LIMIT = 30
# infer fillers cycle much faster than train ones (FILLER_DURATION_RANGE_SEC infer
# 5-15s vs train 15-30s, and infer's own filler target is higher too) - a shared
# "top 30 most-recently-done" cap meant a burst of infer fillers finishing could push
# every recently-done TRAIN job out of the window within well under a minute. That's
# short enough to matter: the scheduler timeline shows ~2 minutes of history
# (AllocationTimeline WINDOW_MS on the frontend), and a train bar whose Job fell out of
# this list renders as an unlabeled gray "J{id}" bar instead of its model name/color -
# looked like a bug because it visually was one. Capping per job_type instead of
# sharing one bucket stops the faster type from crowding out the other.
DASHBOARD_DONE_LIMIT_PER_TYPE = 30


def list_jobs(
    db: Session,
    status: str | None = None,
    user_id: int | None = None,
    limit: int | None = None,
    before_id: int | None = None,
) -> list[schemas.JobSummary]:
    # Fillers show up here now too (demo timeline should look busy in the list, not
    # just the scheduler) - safe now that the list is actually capped instead of
    # growing unbounded for as long as the server's been up.
    def base_query() -> Query:
        q = db.query(models.Job).options(
            selectinload(models.Job.model),
            selectinload(models.Job.dataset),
            selectinload(models.Job.selected_tier).selectinload(models.ResourceTier.requirements).selectinload(models.ResourceTierRequirement.accelerator_model),
            selectinload(models.Job.assignments).selectinload(models.Assignment.node).selectinload(models.Node.cluster),
        )
        if user_id is not None:
            q = q.filter(models.Job.user_id == user_id)
        return q

    # id as a tiebreaker: two fillers created in the same sweep share the exact same
    # submitted_at (clock.now() called once, reused for both), and without a tiebreaker
    # Postgres doesn't guarantee a stable order among ties - same list, reshuffled
    # between polls.
    order = (desc(models.Job.submitted_at), desc(models.Job.id))

    if limit is not None:
        # Paginated browsing (job list page below the live board) - separate access
        # pattern from the dashboard calls below, so it ignores the active/done split
        # and JOB_LIST_LIMIT entirely and just pages through whatever `status`/`user_id`
        # matches, oldest-first cut by id. id alone is enough of an order (it's assigned
        # in submission order here) and sidesteps the submitted_at-tie issue above.
        # Fetch one extra row so the caller can tell whether another page exists
        # without changing the response shape (still a plain list[JobSummary]).
        query = base_query()
        if status is not None:
            query = query.filter(models.Job.status == status)
        if before_id is not None:
            query = query.filter(models.Job.id < before_id)
        jobs = query.order_by(desc(models.Job.id)).limit(limit + 1).all()
        return [_to_job_summary(job) for job in jobs]

    if status is not None:
        query = base_query().filter(models.Job.status == status).order_by(*order)
        if status == "done":
            query = query.limit(JOB_LIST_LIMIT)
        jobs = query.all()
    else:
        # Cap only the done bucket - it's the one that grows without bound for as long
        # as the server's up. Active jobs (queued/provisioning/running/finalizing) are
        # naturally bounded by real cluster capacity and must never be capped by age:
        # a real infer job now runs indefinitely, so a plain submitted_at-based limit
        # would eventually push a still-running job out of the window just because
        # enough fillers were created after it.
        # Capped per job_type (not one shared bucket) - see DASHBOARD_DONE_LIMIT_PER_TYPE.
        active = base_query().filter(models.Job.status != "done").order_by(*order).all()
        done = [
            job
            for job_type in ("train", "infer")
            for job in base_query()
            .filter(models.Job.status == "done", models.Job.type == job_type)
            .order_by(*order)
            .limit(DASHBOARD_DONE_LIMIT_PER_TYPE)
            .all()
        ]
        jobs = sorted(active + done, key=lambda j: (j.submitted_at, j.id), reverse=True)

    return [_to_job_summary(job) for job in jobs]


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
    # like a real stop: the serving process needs a moment to unwind/save state
    # before the node is actually released. Node stays occupied - the next
    # sweep's finalizing->done step frees it and logs FINISH.
    job.status = "finalizing"
    job.phase_deadline = now + timedelta(seconds=FINALIZING_SEC["infer"])

    db.commit()
    db.refresh(job)
    return _to_job_summary(job)
