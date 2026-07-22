from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import schemas
from app.database import get_db
from app.services import jobs as jobs_service

router = APIRouter(tags=["jobs"])


@router.get("/jobs", response_model=list[schemas.JobSummary])
def list_jobs(
    status: str | None = None, db: Session = Depends(get_db), _: None = Depends(jobs_service.sweep_dependency)
) -> list[schemas.JobSummary]:
    return jobs_service.list_jobs(db, status=status)


@router.get("/jobs/{job_id}", response_model=schemas.JobDetail)
def get_job_detail(
    job_id: int, db: Session = Depends(get_db), _: None = Depends(jobs_service.sweep_dependency)
) -> schemas.JobDetail:
    detail = jobs_service.get_job_detail(db, job_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="job not found")
    return detail


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


@router.post("/jobs/train", response_model=schemas.JobSummary, status_code=201)
def submit_train_job(
    req: schemas.TrainJobRequest, db: Session = Depends(get_db), _: None = Depends(jobs_service.sweep_dependency)
) -> schemas.JobSummary:
    return jobs_service.submit_job(
        db,
        job_type="train",
        model_id=req.model_id,
        batch=req.batch,
        precision=req.precision,
        priority_pref=req.priority_pref,
        sla_target=None,
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
        precision=req.precision,
        priority_pref=req.priority_pref,
        sla_target=req.sla_target,
    )
