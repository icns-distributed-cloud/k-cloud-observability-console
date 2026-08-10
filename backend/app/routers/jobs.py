from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import schemas
from app.database import get_db
from app.services import jobs as jobs_service

router = APIRouter(tags=["jobs"])


@router.get("/jobs", response_model=list[schemas.JobSummary])
def list_jobs(
    status: str | None = None,
    user_id: int | None = None,
    include_fillers: bool = False,
    db: Session = Depends(get_db),
    _: None = Depends(jobs_service.sweep_dependency),
) -> list[schemas.JobSummary]:
    return jobs_service.list_jobs(db, status=status, user_id=user_id, include_fillers=include_fillers)


@router.get("/jobs/{job_id}", response_model=schemas.JobDetail)
def get_job_detail(
    job_id: int, db: Session = Depends(get_db), _: None = Depends(jobs_service.sweep_dependency)
) -> schemas.JobDetail:
    detail = jobs_service.get_job_detail(db, job_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="job not found")
    return detail


@router.get("/jobs/{job_id}/assignments", response_model=list[schemas.AssignmentItem])
def list_job_assignments(job_id: int, db: Session = Depends(get_db)) -> list[schemas.AssignmentItem]:
    result = jobs_service.list_job_assignments(db, job_id)
    if result is None:
        raise HTTPException(status_code=404, detail="job not found")
    return result


@router.get(
    "/jobs/{job_id}/hyperparam-adjustment", response_model=list[schemas.HyperparamAdjustmentItem]
)
def list_hyperparam_adjustments(
    job_id: int, db: Session = Depends(get_db)
) -> list[schemas.HyperparamAdjustmentItem]:
    result = jobs_service.list_hyperparam_adjustments(db, job_id)
    if result is None:
        raise HTTPException(status_code=404, detail="job not found")
    return result


@router.get("/jobs/{job_id}/kqv-benchmark", response_model=schemas.JobKqvBenchmarkResponse | None)
def get_kqv_benchmark(
    job_id: int, db: Session = Depends(get_db)
) -> schemas.JobKqvBenchmarkResponse | None:
    return jobs_service.get_kqv_benchmark(db, job_id)


@router.get("/jobs/{job_id}/reallocations", response_model=list[schemas.ReallocationItem])
def list_reallocations(job_id: int, db: Session = Depends(get_db)) -> list[schemas.ReallocationItem]:
    result = jobs_service.list_reallocations(db, job_id)
    if result is None:
        raise HTTPException(status_code=404, detail="job not found")
    return result


@router.get("/jobs/{job_id}/negotiations", response_model=schemas.JobNegotiationResponse | None)
def get_negotiations(
    job_id: int, db: Session = Depends(get_db)
) -> schemas.JobNegotiationResponse | None:
    return jobs_service.get_negotiations(db, job_id)


@router.get("/resource-tiers", response_model=list[schemas.ResourceTierItem])
def list_resource_tiers(
    job_type: str, priority_pref: str | None = None, db: Session = Depends(get_db)
) -> list[schemas.ResourceTierItem]:
    return jobs_service.list_resource_tiers(db, job_type, priority_pref)


@router.post("/jobs/train", response_model=schemas.JobSummary, status_code=201)
def submit_train_job(
    req: schemas.TrainJobRequest, db: Session = Depends(get_db), _: None = Depends(jobs_service.sweep_dependency)
) -> schemas.JobSummary:
    return jobs_service.submit_job(
        db,
        job_type="train",
        model_id=req.model_id,
        batch=req.batch,
        priority_pref=req.priority_pref,
        tier_id=req.tier_id,
        user_id=req.user_id,
        dataset_id=req.dataset_id,
    )


@router.post("/jobs/infer", response_model=schemas.JobSummary, status_code=201)
def submit_infer_job(
    req: schemas.InferJobRequest, db: Session = Depends(get_db), _: None = Depends(jobs_service.sweep_dependency)
) -> schemas.JobSummary:
    return jobs_service.submit_job(
        db,
        job_type="infer",
        model_id=req.model_id,
        batch=req.batch,
        priority_pref=req.priority_pref,
        tier_id=req.tier_id,
        user_id=req.user_id,
    )


@router.post("/jobs/{job_id}/stop", response_model=schemas.JobSummary)
def stop_job(
    job_id: int, db: Session = Depends(get_db), _: None = Depends(jobs_service.sweep_dependency)
) -> schemas.JobSummary:
    result = jobs_service.stop_job(db, job_id)
    if result is None:
        raise HTTPException(status_code=404, detail="job not found")
    return result
